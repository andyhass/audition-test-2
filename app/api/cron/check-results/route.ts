import { db } from "@/lib/db"
import { sports_events, bet_cache } from "@/lib/db/schema"
import { eq, or } from "drizzle-orm"
import { requestSettlementOnChain, publicClient, CONTRACT_ADDRESS } from "@/lib/contracts/client"
import { BETTING_PLATFORM_ABI } from "@/lib/contracts/abi"
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

    // 4. Request on-chain settlement
    if (event.on_chain_event_id) {
      try {
        await requestSettlementOnChain(BigInt(event.on_chain_event_id))
      } catch (err) {
        console.error(`Settlement request failed for event ${event.external_id}:`, err)
      }
    }
    settled++
  }

  // 5. Poll for EventSettled logs and update bet_cache
  if (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
    const blockNumber = await publicClient.getBlockNumber()
    const fromBlock = blockNumber - 1000n > 0n ? blockNumber - 1000n : 0n

    const eventSettledAbi = BETTING_PLATFORM_ABI.find(
      (x): x is Extract<typeof x, { type: "event"; name: "EventSettled" }> =>
        "type" in x && x.type === "event" && "name" in x && x.name === "EventSettled"
    )
    if (!eventSettledAbi) throw new Error("EventSettled ABI not found")

    const settledLogs = await publicClient.getLogs({
      address: CONTRACT_ADDRESS,
      event: parseAbiItem("event EventSettled(uint256 indexed eventId, uint8 result)"),
      fromBlock,
      toBlock: blockNumber,
    })

    for (const log of settledLogs) {
      const { eventId, result: rawResult } = log.args as { eventId: bigint; result: number }
      const resultMap: Record<number, "home_win" | "away_win" | "draw"> = {
        0: "home_win", 1: "away_win", 2: "draw",
      }
      const resolvedResult = resultMap[rawResult]
      if (!resolvedResult) continue

      // Find matching DB event
      const [evt] = await db
        .select()
        .from(sports_events)
        .where(eq(sports_events.on_chain_event_id, eventId.toString()))
      if (!evt) continue

      // Update bet_cache rows
      const bets = await db
        .select()
        .from(bet_cache)
        .where(eq(bet_cache.event_id, evt.id))

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
        await db
          .update(bet_cache)
          .set({ status: newStatus })
          .where(eq(bet_cache.id, bet.id))
      }
    }
  }

  return Response.json({ settled })
}
