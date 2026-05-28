import { db } from "@/lib/db"
import { sports_events, bet_cache } from "@/lib/db/schema"
import { eq, or } from "drizzle-orm"
import { settleEventOnChain, publicClient, CONTRACT_ADDRESS } from "@/lib/contracts/client"
import { parseAbiItem } from "viem"

function verifyCronSecret(request: Request) {
  return request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
}

interface SportsDBEvent {
  idEvent: string
  strStatus: string
  intHomeScore: string | null
  intAwayScore: string | null
}

function toResult(homeScore: number, awayScore: number): "home_win" | "away_win" | "draw" {
  if (homeScore > awayScore) return "home_win"
  if (awayScore > homeScore) return "away_win"
  return "draw"
}

function resultToCode(result: "home_win" | "away_win" | "draw"): number {
  if (result === "home_win") return 0
  if (result === "away_win") return 1
  return 2
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return new Response("Unauthorized", { status: 401 })
  }

  const apiKey = process.env.THESPORTSDB_API_KEY ?? "3"
  const now = new Date()

  // 1. Find events that may have finished (match_time passed, not yet completed)
  const pending = await db
    .select()
    .from(sports_events)
    .where(
      or(
        eq(sports_events.status, "upcoming"),
        eq(sports_events.status, "live")
      )
    )

  const maybeDone = pending.filter((e) => e.match_time < now)
  let settled = 0

  for (const event of maybeDone) {
    // 2. Fetch result from TheSportsDB
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/${apiKey}/lookupevent.php?id=${event.external_id}`
    )
    const data = await res.json()
    const raw: SportsDBEvent | undefined = data.events?.[0]

    if (!raw || raw.strStatus !== "Match Finished") {
      // Mark as live if not finished
      if (event.status === "upcoming") {
        await db
          .update(sports_events)
          .set({ status: "live" })
          .where(eq(sports_events.id, event.id))
      }
      continue
    }

    const homeScore = parseInt(raw.intHomeScore ?? "0")
    const awayScore = parseInt(raw.intAwayScore ?? "0")
    const result = toResult(homeScore, awayScore)

    // 3. Update DB
    await db
      .update(sports_events)
      .set({ status: "completed", result })
      .where(eq(sports_events.id, event.id))

    // 4. Settle on-chain and update bet_cache
    if (event.on_chain_event_id) {
      try {
        await settleEventOnChain(BigInt(event.on_chain_event_id), resultToCode(result))

        // After settleEventOnChain succeeds, update bet_cache directly
        const bets = await db.select().from(bet_cache).where(eq(bet_cache.event_id, event.id))
        for (const bet of bets) {
          if (bet.status !== "pending") continue
          let newStatus: "won" | "lost" | "refunded"
          if (result === "draw") {
            newStatus = "refunded"
          } else {
            const betWon =
              (result === "home_win" && bet.side === "home") ||
              (result === "away_win" && bet.side === "away")
            newStatus = betWon ? "won" : "lost"
          }
          await db.update(bet_cache).set({ status: newStatus }).where(eq(bet_cache.id, bet.id))
        }
      } catch (err) {
        console.error(`Settlement failed for event ${event.external_id}:`, err)
      }
    }
    settled++
  }

  // Reconcile: poll EventSettled logs and sync any settlements not yet reflected in DB
  // This handles manual settlements (via script) and any missed cron runs
  if (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
    const blockNumber = await publicClient.getBlockNumber()
    const fromBlock = blockNumber > 10000n ? blockNumber - 10000n : 0n

    const settledLogs = await publicClient.getLogs({
      address: CONTRACT_ADDRESS,
      event: parseAbiItem("event EventSettled(uint256 indexed eventId, uint8 result)"),
      fromBlock,
      toBlock: blockNumber,
    })

    const resultMap: Record<number, "home_win" | "away_win" | "draw"> = {
      0: "home_win", 1: "away_win", 2: "draw",
    }

    for (const log of settledLogs) {
      const { eventId, result: rawResult } = log.args as { eventId: bigint; result: number }
      const resolvedResult = resultMap[rawResult]
      if (!resolvedResult) continue

      const [evt] = await db
        .select()
        .from(sports_events)
        .where(eq(sports_events.on_chain_event_id, eventId.toString()))
      if (!evt || evt.status === "completed") continue

      // Sync event status to DB
      await db
        .update(sports_events)
        .set({ status: "completed", result: resolvedResult })
        .where(eq(sports_events.id, evt.id))

      // Sync bet outcomes
      const bets = await db.select().from(bet_cache).where(eq(bet_cache.event_id, evt.id))
      for (const bet of bets) {
        if (bet.status !== "pending") continue
        let newStatus: "won" | "lost" | "refunded"
        if (resolvedResult === "draw") {
          newStatus = "refunded"
        } else {
          const betWon =
            (resolvedResult === "home_win" && bet.side === "home") ||
            (resolvedResult === "away_win" && bet.side === "away")
          newStatus = betWon ? "won" : "lost"
        }
        await db.update(bet_cache).set({ status: newStatus }).where(eq(bet_cache.id, bet.id))
      }
    }
  }

  return Response.json({ settled })
}
