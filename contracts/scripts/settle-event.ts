// contracts/scripts/settle-event.ts
// Usage: EVENT_ID=0 RESULT=0 pnpm settle:sepolia
//   RESULT: 0 = home win, 1 = away win, 2 = draw
import hre from "hardhat"

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!

const PLATFORM_ABI = [
  "function settle(uint256 eventId, uint8 result) external",
  "function events(uint256 eventId) view returns (uint256 id, string homeTeam, string awayTeam, uint256 homeOdds, uint256 awayOdds, uint256 startTime, uint8 status, string externalId)",
]

const RESULT_LABELS: Record<string, string> = { "0": "Home win", "1": "Away win", "2": "Draw" }

async function main() {
  if (!CONTRACT_ADDRESS) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS not set in .env.local")

  const eventId = process.env.EVENT_ID
  const result = process.env.RESULT
  if (eventId === undefined) throw new Error("EVENT_ID env var required (e.g. EVENT_ID=0)")
  if (result === undefined) throw new Error("RESULT env var required (0=home win, 1=away win, 2=draw)")
  if (!["0", "1", "2"].includes(result)) throw new Error("RESULT must be 0, 1, or 2")

  const [deployer] = await hre.ethers.getSigners()
  const platform = new hre.ethers.Contract(CONTRACT_ADDRESS, PLATFORM_ABI, deployer)

  const evt = await platform.events(BigInt(eventId))
  console.log(`Event ${eventId}: ${evt.homeTeam} vs ${evt.awayTeam}`)
  console.log(`Settling as: ${RESULT_LABELS[result]}`)

  const tx = await platform.settle(BigInt(eventId), Number(result))
  await tx.wait()
  console.log(`Settled. Tx: ${tx.hash}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
