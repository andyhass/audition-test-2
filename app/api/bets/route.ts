import { auth } from "@/auth"
import { db } from "@/lib/db"
import { bet_cache, sports_events } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const body = await request.json()
  const { txHash, eventId, side, amountUsdc, oddsSnapshot } = body as {
    txHash: string
    eventId: string   // DB uuid of the sports_event
    side: "home" | "away"
    amountUsdc: string
    oddsSnapshot: string
  }

  if (!txHash || !eventId || !side || !amountUsdc || !oddsSnapshot) {
    return new Response("Missing required fields", { status: 400 })
  }

  // Verify event exists
  const [event] = await db
    .select({ id: sports_events.id })
    .from(sports_events)
    .where(eq(sports_events.id, eventId))
  if (!event) return new Response("Event not found", { status: 404 })

  await db.insert(bet_cache).values({
    tx_hash: txHash,
    wallet_address: session.user.address,
    event_id: eventId,
    side,
    amount_usdc: amountUsdc,
    odds_snapshot: oddsSnapshot,
  })

  return new Response(null, { status: 201 })
}
