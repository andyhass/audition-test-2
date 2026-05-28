"use client"

interface Bet {
  id: string
  homeTeam: string
  awayTeam: string
  side: string
  amountUsdc: string
  oddsSnapshot: string
  status: string
  matchTime: string
}

const statusStyles: Record<string, string> = {
  pending:  "bg-zinc-700 text-zinc-300",
  won:      "bg-green-900 text-green-300",
  lost:     "bg-red-900 text-red-300",
  refunded: "bg-zinc-700 text-zinc-400",
}

export function BetList({ bets }: { bets: Bet[] }) {
  if (bets.length === 0) {
    return <p className="text-zinc-600 text-sm text-center py-16">You haven't placed any bets yet.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {bets.map((bet) => {
        const payout = (parseFloat(bet.amountUsdc) * parseFloat(bet.oddsSnapshot)).toFixed(2)
        return (
          <div key={bet.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white">
                {bet.homeTeam} vs {bet.awayTeam}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusStyles[bet.status] ?? statusStyles.pending}`}>
                {bet.status}
              </span>
            </div>
            <div className="text-xs text-zinc-500 space-y-0.5">
              <div>Picked: <span className="text-zinc-300">{bet.side === "home" ? bet.homeTeam : bet.awayTeam}</span></div>
              <div>Stake: <span className="text-zinc-300">{parseFloat(bet.amountUsdc).toFixed(2)} USDC</span> @ <span className="text-zinc-300">{parseFloat(bet.oddsSnapshot).toFixed(2)}×</span></div>
              {bet.status === "won" && (
                <div>Payout: <span className="text-green-400 font-medium">{payout} USDC</span></div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
