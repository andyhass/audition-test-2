import { db } from "@/lib/db"
import { sports_events, leagues } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { createEventOnChain, updateOddsOnChain } from "@/lib/contracts/client"

function verifyCronSecret(request: Request) {
  const auth = request.headers.get("authorization")
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

interface SportsDBEvent {
  idEvent: string
  strHomeTeam: string
  strAwayTeam: string
  dateEvent: string
  strTime: string
  intHomeScore: string | null
  intAwayScore: string | null
  strStatus: string
  intEventFBHome?: string
  intEventFBAway?: string
}

// Returns decimal odds as string for DB storage (e.g., "1.8000")
function parseDecimalOdds(odds: string | undefined): string | null {
  if (!odds) return null
  const n = parseFloat(odds)
  if (isNaN(n) || n <= 0) return null
  return n.toFixed(4)
}

// Returns basis points for on-chain (e.g., 18000n for 1.80x)
function decimalOddsToBasePts(odds: string | undefined): bigint | null {
  if (!odds) return null
  const n = parseFloat(odds)
  if (isNaN(n) || n <= 0) return null
  return BigInt(Math.round(n * 10000))
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return new Response("Unauthorized", { status: 401 })
  }

  const apiKey = process.env.THESPORTSDB_API_KEY ?? "3"
  const EPL_ID = "4328"

  const res = await fetch(
    `https://www.thesportsdb.com/api/v1/json/${apiKey}/eventsnextleague.php?id=${EPL_ID}`
  )
  const data = await res.json()
  const rawEvents: SportsDBEvent[] = data.events ?? []

  // Find EPL league row
  const [epl] = await db.select().from(leagues).where(eq(leagues.external_id, EPL_ID))
  if (!epl) return new Response("EPL league not seeded", { status: 500 })

  let created = 0, updated = 0

  for (const raw of rawEvents) {
    const matchTime = new Date(`${raw.dateEvent}T${raw.strTime ?? "00:00:00"}Z`)
    const homeOddsDb = parseDecimalOdds(raw.intEventFBHome?.toString())
    const awayOddsDb = parseDecimalOdds(raw.intEventFBAway?.toString())
    const homeOddsBp = decimalOddsToBasePts(raw.intEventFBHome?.toString())
    const awayOddsBp = decimalOddsToBasePts(raw.intEventFBAway?.toString())

    // Upsert into DB
    const [existing] = await db
      .select()
      .from(sports_events)
      .where(eq(sports_events.external_id, raw.idEvent))

    if (!existing) {
      // Create in DB first
      const [inserted] = await db
        .insert(sports_events)
        .values({
          external_id: raw.idEvent,
          league_id: epl.id,
          home_team: raw.strHomeTeam,
          away_team: raw.strAwayTeam,
          match_time: matchTime,
          home_odds: homeOddsDb,
          away_odds: awayOddsDb,
        })
        .returning()

      // Register on-chain if contract is configured
      if (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
        try {
          const onChainId = await createEventOnChain({
            homeTeam: raw.strHomeTeam,
            awayTeam: raw.strAwayTeam,
            homeOdds: homeOddsBp ?? 0n,
            awayOdds: awayOddsBp ?? 0n,
            startTime: BigInt(Math.floor(matchTime.getTime() / 1000)),
            externalId: raw.idEvent,
          })
          await db
            .update(sports_events)
            .set({ on_chain_event_id: onChainId.toString() })
            .where(eq(sports_events.id, inserted.id))
        } catch (err) {
          console.error(`Failed to register event ${raw.idEvent} on-chain:`, err)
        }
      }
      created++
    } else if (homeOddsDb && awayOddsDb && existing.on_chain_event_id) {
      // Update odds if changed
      await db
        .update(sports_events)
        .set({ home_odds: homeOddsDb, away_odds: awayOddsDb })
        .where(eq(sports_events.external_id, raw.idEvent))
      try {
        await updateOddsOnChain(BigInt(existing.on_chain_event_id), homeOddsBp!, awayOddsBp!)
      } catch (err) {
        console.error(`Failed to update odds for event ${raw.idEvent}:`, err)
      }
      updated++
    }
  }

  return Response.json({ created, updated, total: rawEvents.length })
}
