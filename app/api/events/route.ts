import { db } from "@/lib/db"
import { sports_events, leagues } from "@/lib/db/schema"
import { ne, asc, eq } from "drizzle-orm"

export async function GET() {
  const events = await db
    .select({
      id: sports_events.id,
      externalId: sports_events.external_id,
      onChainEventId: sports_events.on_chain_event_id,
      homeTeam: sports_events.home_team,
      awayTeam: sports_events.away_team,
      matchTime: sports_events.match_time,
      status: sports_events.status,
      homeOdds: sports_events.home_odds,
      awayOdds: sports_events.away_odds,
      result: sports_events.result,
      league: leagues.name,
      sport: leagues.sport,
    })
    .from(sports_events)
    .innerJoin(leagues, eq(leagues.id, sports_events.league_id))
    .where(ne(sports_events.status, "cancelled"))
    .orderBy(asc(sports_events.match_time))

  return Response.json(events)
}
