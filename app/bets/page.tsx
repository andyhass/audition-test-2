import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { bet_cache, sports_events } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NavBar } from "@/components/NavBar"
import { BetList } from "@/components/BetList"

export default async function BetsPage() {
  const session = await auth()
  if (!session) redirect("/")

  const bets = await db
    .select({
      id: bet_cache.id,
      homeTeam: sports_events.home_team,
      awayTeam: sports_events.away_team,
      side: bet_cache.side,
      amountUsdc: bet_cache.amount_usdc,
      oddsSnapshot: bet_cache.odds_snapshot,
      status: bet_cache.status,
      matchTime: sports_events.match_time,
    })
    .from(bet_cache)
    .innerJoin(sports_events, eq(sports_events.id, bet_cache.event_id))
    .where(eq(bet_cache.wallet_address, session.user.address))
    .orderBy(sports_events.match_time)

  const serialized = bets.map((b) => ({
    ...b,
    matchTime: b.matchTime.toISOString(),
  }))

  return (
    <>
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-lg font-semibold text-white mb-6">My Bets</h1>
        <BetList bets={serialized} />
      </main>
    </>
  )
}
