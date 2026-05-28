import { NavBar } from "@/components/NavBar"
import { EventsList } from "@/components/EventsList"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { sports_events, leagues, users } from "@/lib/db/schema"
import { eq, ne, asc } from "drizzle-orm"

export default async function Home() {
  const session = await auth()

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

  let userTimezone = "UTC"
  if (session?.user?.address) {
    const [user] = await db
      .select({ preferred_timezone: users.preferred_timezone })
      .from(users)
      .where(eq(users.wallet_address, session.user.address))
    if (user) userTimezone = user.preferred_timezone
  }

  const serialized = events.map((e) => ({
    ...e,
    matchTime: e.matchTime.toISOString(),
  }))

  return (
    <>
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-white">Active Matches</h1>
            {session && (
              <p className="text-sm text-zinc-500 mt-0.5">Click a match to place a bet</p>
            )}
          </div>
        </div>

        {!session ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">⚽</div>
            <h2 className="text-xl font-bold text-white mb-2">Connect your wallet to bet</h2>
            <p className="text-zinc-500 text-sm max-w-xs mx-auto">
              Sign in with Ethereum to view and place bets on EPL matches.
            </p>
          </div>
        ) : (
          <EventsList events={serialized} userTimezone={userTimezone} />
        )}
      </main>
    </>
  )
}
