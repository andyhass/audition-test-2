"use client"

import { useState, useEffect } from "react"
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount } from "wagmi"
import { parseUnits, formatUnits } from "viem"
import { BETTING_PLATFORM_ABI } from "@/lib/contracts/abi"
import type { Event } from "./EventCard"

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const

const USDC_ABI = [
  {
    type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const

const QUICK_PICKS = [10, 25, 50, 100]

interface BetModalProps {
  event: Event
  onClose: () => void
}

export function BetModal({ event, onClose }: BetModalProps) {
  const [side, setSide] = useState<0 | 1 | null>(null) // 0=home, 1=away
  const [amount, setAmount] = useState("")
  const [step, setStep] = useState<"pick" | "approving" | "betting" | "done">("pick")

  const { writeContract, data: approveTxHash, error: approveError } = useWriteContract()
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash })

  const { writeContract: writeBet, data: betTxHash, error: betError } = useWriteContract()
  const { isSuccess: betSuccess } = useWaitForTransactionReceipt({ hash: betTxHash })

  useEffect(() => {
    if (approveError) setStep("pick")
  }, [approveError])

  useEffect(() => {
    if (betError) setStep("approving")
  }, [betError])

  const amountNum = parseFloat(amount) || 0

  const { address } = useAccount()
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
  const balanceNum = usdcBalance !== undefined ? parseFloat(formatUnits(usdcBalance, 6)) : null
  const exceedsBalance = balanceNum !== null && amountNum > balanceNum
  const oddsNum = side === 0
    ? parseFloat(event.homeOdds ?? "0")
    : parseFloat(event.awayOdds ?? "0")
  const payout = (amountNum * oddsNum).toFixed(2)

  function handleApprove() {
    if (side === null || amountNum <= 0) return
    setStep("approving")
    writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [CONTRACT_ADDRESS, parseUnits(amount, 6)],
    })
  }

  function handleBet() {
    if (side === null || !event.onChainEventId) return
    setStep("betting")
    writeBet({
      address: CONTRACT_ADDRESS,
      abi: BETTING_PLATFORM_ABI,
      functionName: "placeBet",
      args: [BigInt(event.onChainEventId), side, parseUnits(amount, 6)],
    })
  }

  useEffect(() => {
    if (!betSuccess || !betTxHash || side === null || !event.id) return
    const oddsNum = side === 0
      ? parseFloat(event.homeOdds ?? "0")
      : parseFloat(event.awayOdds ?? "0")

    fetch("/api/bets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        txHash: betTxHash,
        eventId: event.id,
        side: side === 0 ? "home" : "away",
        amountUsdc: amount,
        oddsSnapshot: oddsNum.toFixed(4),
      }),
    }).catch(console.error)
  }, [betSuccess])

  if (betSuccess) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm text-center">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="text-lg font-bold text-white mb-2">Bet placed!</h3>
          <p className="text-zinc-400 text-sm mb-6">
            {amountNum} USDC on {side === 0 ? event.homeTeam : event.awayTeam}
          </p>
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-zinc-500 mb-1">{event.league}</p>
            <h3 className="font-bold text-white text-base">{event.homeTeam} vs {event.awayTeam}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Pick side */}
        <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Pick a side</p>
        <div className="flex gap-2 mb-5">
          {([0, 1] as const).map((s) => {
            const team = s === 0 ? event.homeTeam : event.awayTeam
            const odds = s === 0 ? event.homeOdds : event.awayOdds
            const selected = side === s
            return (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`flex-1 rounded-xl py-3 text-center border transition-colors ${
                  selected
                    ? "bg-blue-900 border-blue-500"
                    : "bg-zinc-950 border-zinc-700 hover:border-zinc-500"
                }`}
              >
                <div className={`text-xs font-semibold mb-1 ${selected ? "text-white" : "text-zinc-400"}`}>
                  {team}
                </div>
                <div className={`text-xl font-bold ${selected ? "text-blue-300" : "text-zinc-500"}`}>
                  {odds ? parseFloat(odds).toFixed(2) : "—"}×
                </div>
              </button>
            )
          })}
        </div>

        {/* Amount */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Bet amount (USDC)</p>
          {balanceNum !== null && (
            <p className="text-[11px] text-zinc-500">
              Balance: <span className={exceedsBalance ? "text-red-400" : "text-zinc-300"}>{balanceNum.toFixed(2)} USDC</span>
            </p>
          )}
        </div>
        <div className={`bg-zinc-950 border rounded-xl px-4 py-3 flex items-center justify-between mb-2 ${exceedsBalance ? "border-red-500" : "border-zinc-700"}`}>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="bg-transparent text-xl font-bold text-white outline-none w-full"
          />
          <span className="text-zinc-500 text-sm ml-2 shrink-0">USDC</span>
        </div>
        <div className="flex gap-2 mb-5">
          {QUICK_PICKS.map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v.toString())}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg py-1.5 text-xs text-zinc-300"
            >
              {v}
            </button>
          ))}
        </div>

        {/* Summary */}
        {side !== null && amountNum > 0 && (
          <div className="bg-zinc-950 rounded-xl px-4 py-3 mb-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Potential payout</span>
              <span className="text-green-400 font-semibold">{payout} USDC</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Odds locked at</span>
              <span className="text-white">{oddsNum.toFixed(2)}×</span>
            </div>
          </div>
        )}

        {/* Action button */}
        {step === "pick" && (
          <>
            {exceedsBalance && (
              <p className="text-red-400 text-xs text-center mb-2">Insufficient USDC balance</p>
            )}
            <button
              onClick={handleApprove}
              disabled={side === null || amountNum <= 0 || exceedsBalance}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Approve USDC
            </button>
          </>
        )}

        {step === "approving" && !approveSuccess && (
          <button disabled className="w-full bg-zinc-700 text-zinc-400 font-semibold py-3 rounded-xl">
            Approving…
          </button>
        )}

        {step === "approving" && approveSuccess && (
          <button
            onClick={handleBet}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl"
          >
            Place Bet
          </button>
        )}

        {step === "betting" && (
          <button disabled className="w-full bg-zinc-700 text-zinc-400 font-semibold py-3 rounded-xl">
            Placing bet…
          </button>
        )}
      </div>
    </div>
  )
}
