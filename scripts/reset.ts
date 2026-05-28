// scripts/reset.ts
// Truncates the DB, deploys a fresh contract, updates .env.local, and syncs events.
// Usage: pnpm reset
import { execSync } from "child_process"
import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { db } from "../lib/db/index"
import { bet_cache, sports_events, users } from "../lib/db/schema"

const ROOT = process.cwd()

async function reset() {
  // 1. Truncate DB
  console.log("1/4  Truncating database…")
  await db.delete(bet_cache)
  await db.delete(sports_events)
  await db.delete(users)
  console.log("     ✓ bet_cache, sports_events, users cleared\n")

  // 2. Deploy contract
  console.log("2/4  Deploying contract to Base Sepolia…")
  const deployOutput = execSync("pnpm deploy:sepolia", {
    cwd: resolve(ROOT, "contracts"),
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  })
  console.log(deployOutput)

  const match = deployOutput.match(/BettingPlatform deployed to: (0x[a-fA-F0-9]{40})/)
  if (!match) throw new Error("Could not find contract address in deploy output")
  const contractAddress = match[1]

  // 3. Update .env.local
  console.log("3/4  Updating .env.local…")
  const envPath = resolve(ROOT, ".env.local")
  let envContent = readFileSync(envPath, "utf8")
  if (envContent.includes("NEXT_PUBLIC_CONTRACT_ADDRESS=")) {
    envContent = envContent.replace(
      /NEXT_PUBLIC_CONTRACT_ADDRESS=.*/,
      `NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`
    )
  } else {
    envContent += `\nNEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`
  }
  writeFileSync(envPath, envContent)
  console.log(`     ✓ NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}\n`)

  // 4. Sync events (requires dev server to be running)
  console.log("4/4  Syncing events…")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.log("     ⚠  CRON_SECRET not set — skipping sync. Run manually after starting the dev server.")
  } else {
    try {
      const syncOutput = execSync(
        `curl -sf -X GET http://localhost:3000/api/cron/sync-events -H "Authorization: Bearer ${cronSecret}"`,
        { encoding: "utf8" }
      )
      console.log(`     ✓ ${syncOutput.trim()}`)
    } catch {
      console.log("     ⚠  Could not reach http://localhost:3000 — start the dev server, then run:")
      console.log(`     curl -X GET http://localhost:3000/api/cron/sync-events -H "Authorization: Bearer ${cronSecret}"`)
    }
  }

  console.log("\n✅  Reset complete!")
  console.log("\nRemember to deposit liquidity into the new contract:")
  console.log("    cd contracts && pnpm deposit:sepolia\n")

  process.exit(0)
}

reset().catch((err) => {
  console.error("\n❌  Reset failed:", err.message ?? err)
  process.exit(1)
})
