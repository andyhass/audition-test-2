// contracts/scripts/deploy.ts
import hre from "hardhat"

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  console.log(`Deploying from: ${deployer.address}`)
  console.log("Deploying BettingPlatform...")
  const BettingPlatform = await hre.ethers.getContractFactory("BettingPlatform", deployer)
  const platform = await BettingPlatform.deploy(USDC_BASE_SEPOLIA)
  await platform.waitForDeployment()
  const address = await platform.getAddress()
  console.log(`BettingPlatform deployed to: ${address}`)
  console.log("")
  console.log("Next steps:")
  console.log(`  1. Add NEXT_PUBLIC_CONTRACT_ADDRESS=${address} to .env.local`)
  console.log(`  2. Fund admin wallet with USDC and call depositLiquidity()`)
}

main().catch((err) => { console.error(err); process.exit(1) })
