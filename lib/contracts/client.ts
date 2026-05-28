// lib/contracts/client.ts
// SERVER-ONLY — never import in client components
import { createWalletClient, createPublicClient, http, decodeEventLog } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { baseSepolia } from "viem/chains"
import { BETTING_PLATFORM_ABI } from "./abi"

const account = privateKeyToAccount(
  `0x${process.env.ADMIN_PRIVATE_KEY!.replace(/^0x/, "")}`
)

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL),
})

export const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL),
})

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`

export async function createEventOnChain(args: {
  homeTeam: string
  awayTeam: string
  homeOdds: bigint
  awayOdds: bigint
  startTime: bigint
  externalId: string
}): Promise<bigint> {
  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: BETTING_PLATFORM_ABI,
    functionName: "createEvent",
    args: [args.homeTeam, args.awayTeam, args.homeOdds, args.awayOdds, args.startTime, args.externalId],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const log = receipt.logs
    .map((l) => {
      try {
        return { ...l, parsed: decodeEventLog({ abi: BETTING_PLATFORM_ABI, ...l }) }
      } catch { return null }
    })
    .find((l) => l?.parsed?.eventName === "EventCreated")
  if (!log?.parsed) throw new Error("EventCreated log not found")
  return (log.parsed.args as { eventId: bigint }).eventId
}

export async function updateOddsOnChain(eventId: bigint, homeOdds: bigint, awayOdds: bigint) {
  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: BETTING_PLATFORM_ABI,
    functionName: "updateOdds",
    args: [eventId, homeOdds, awayOdds],
  })
  await publicClient.waitForTransactionReceipt({ hash })
}

export async function settleEventOnChain(eventId: bigint, result: number) {
  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: BETTING_PLATFORM_ABI,
    functionName: "settle",
    args: [eventId, result],
  })
  await publicClient.waitForTransactionReceipt({ hash })
}
