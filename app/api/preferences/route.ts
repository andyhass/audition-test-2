import { auth } from "@/auth"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  const session = await auth()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.wallet_address, session.user.address))

  if (!user) return new Response("Not found", { status: 404 })
  return Response.json(user)
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const body = await request.json()
  const { preferred_timezone, favorite_sports, top_leagues } = body

  await db
    .update(users)
    .set({
      ...(preferred_timezone !== undefined && { preferred_timezone }),
      ...(favorite_sports !== undefined && { favorite_sports }),
      ...(top_leagues !== undefined && { top_leagues }),
    })
    .where(eq(users.wallet_address, session.user.address))

  return new Response(null, { status: 204 })
}
