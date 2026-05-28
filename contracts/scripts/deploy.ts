// contracts/scripts/deploy.ts
import hre from "hardhat"
import { readFileSync } from "fs"
import { join } from "path"

// Base Sepolia Chainlink Functions Router
const CHAINLINK_ROUTER = "0xf9B8fc078197181C841c296C876945aaa425B278"
// USDC on Base Sepolia (Circle official)
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

async function main() {
  const subscriptionId = process.env.CHAINLINK_SUBSCRIPTION_ID
  if (!subscriptionId) throw new Error("CHAINLINK_SUBSCRIPTION_ID required")

  const source = readFileSync(join(__dirname, "../functions-source.js"), "utf8")

  console.log("Deploying BettingPlatform...")
  const BettingPlatform = await hre.ethers.getContractFactory("BettingPlatform")
  const platform = await BettingPlatform.deploy(
    CHAINLINK_ROUTER,
    USDC_BASE_SEPOLIA,
    BigInt(subscriptionId),
    source
  )
  await platform.waitForDeployment()
  const address = await platform.getAddress()
  console.log(`BettingPlatform deployed to: ${address}`)
  console.log("")
  console.log("Next steps:")
  console.log(`  1. Add NEXT_PUBLIC_CONTRACT_ADDRESS=${address} to .env.local`)
  console.log(`  2. Add contract as Chainlink Functions consumer at https://functions.chain.link`)
  console.log(`  3. Fund admin wallet with USDC and call depositLiquidity()`)
}

main().catch((err) => { console.error(err); process.exit(1) })
