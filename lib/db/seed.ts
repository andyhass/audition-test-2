// lib/db/seed.ts
import { db } from "./index"
import { leagues } from "./schema"

async function seed() {
  await db.insert(leagues).values({
    name: "English Premier League",
    sport: "soccer",
    external_id: "4328",
  }).onConflictDoNothing()
  console.log("Seeded EPL league")
  process.exit(0)
}

seed().catch((err) => { console.error(err); process.exit(1) })
