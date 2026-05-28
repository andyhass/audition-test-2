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

const RECEIPT_TIMEOUT = 60_000 // 60 seconds
const RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 3_000

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < RETRY_ATTEMPTS) {
        console.warn(`${label} failed (attempt ${attempt}/${RETRY_ATTEMPTS}), retrying in ${RETRY_DELAY_MS}ms…`, err)
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      }
    }
  }
  throw lastError
}

export async function createEventOnChain(args: {
  homeTeam: string
  awayTeam: string
  homeOdds: bigint
  awayOdds: bigint
  startTime: bigint
  externalId: string
}): Promise<bigint> {
  return withRetry(async () => {
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: BETTING_PLATFORM_ABI,
      functionName: "createEvent",
      args: [args.homeTeam, args.awayTeam, args.homeOdds, args.awayOdds, args.startTime, args.externalId],
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT })
    const log = receipt.logs
      .map((l) => {
        try {
          return { ...l, parsed: decodeEventLog({ abi: BETTING_PLATFORM_ABI, ...l }) }
        } catch { return null }
      })
      .find((l) => l?.parsed?.eventName === "EventCreated")
    if (!log?.parsed) throw new Error("EventCreated log not found")
    return (log.parsed.args as { eventId: bigint }).eventId
  }, `createEvent(${args.externalId})`)
}

export async function updateOddsOnChain(eventId: bigint, homeOdds: bigint, awayOdds: bigint) {
  return withRetry(async () => {
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: BETTING_PLATFORM_ABI,
      functionName: "updateOdds",
      args: [eventId, homeOdds, awayOdds],
    })
    await publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT })
  }, `updateOdds(${eventId})`)
}

export async function settleEventOnChain(eventId: bigint, result: number) {
  return withRetry(async () => {
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: BETTING_PLATFORM_ABI,
      functionName: "settle",
      args: [eventId, result],
    })
    await publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT })
  }, `settle(${eventId})`)
}
