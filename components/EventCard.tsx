"use client"

import { useState } from "react"

export interface Event {
  id: string
  onChainEventId: string | null
  homeTeam: string
  awayTeam: string
  matchTime: string
  status: string
  homeOdds: string | null
  awayOdds: string | null
  result: string
  league: string
}

interface EventCardProps {
  event: Event
  onBet: (event: Event) => void
  userTimezone?: string
}

export function EventCard({ event, onBet, userTimezone = "UTC" }: EventCardProps) {
  const isOpen = event.status === "upcoming" && event.onChainEventId
  const isLive = event.status === "live"

  const matchDate = new Date(event.matchTime)
  const formatted = matchDate.toLocaleString("en-GB", {
    timeZone: userTimezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div
      className={`bg-zinc-900 border rounded-xl p-4 flex items-center gap-4 transition-colors ${
        isOpen
          ? "border-zinc-700 hover:border-blue-500 cursor-pointer"
          : "border-zinc-800 opacity-60"
      }`}
      onClick={() => isOpen && onBet(event)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          {isLive && (
            <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-semibold">
              ● LIVE
            </span>
          )}
          <span className="text-xs text-zinc-500">{formatted}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-white text-sm truncate">{event.homeTeam}</span>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded shrink-0">
            {isLive ? "LIVE" : "vs"}
          </span>
          <span className="font-semibold text-white text-sm truncate">{event.awayTeam}</span>
        </div>
      </div>

      {isOpen && event.homeOdds && event.awayOdds ? (
        <div className="flex gap-2 shrink-0">
          <div className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-center min-w-[68px]">
            <div className="text-[10px] text-zinc-500 uppercase mb-1 truncate max-w-[60px]">
              {event.homeTeam.split(" ").pop()}
            </div>
            <div className="text-base font-bold text-green-400">
              {parseFloat(event.homeOdds).toFixed(2)}×
            </div>
          </div>
          <div className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-center min-w-[68px]">
            <div className="text-[10px] text-zinc-500 uppercase mb-1 truncate max-w-[60px]">
              {event.awayTeam.split(" ").pop()}
            </div>
            <div className="text-base font-bold text-amber-400">
              {parseFloat(event.awayOdds).toFixed(2)}×
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-600 shrink-0">
          {isLive ? "Awaiting result" : "Odds unavailable"}
        </div>
      )}

      {isOpen && <div className="text-zinc-600 text-lg shrink-0">›</div>}
    </div>
  )
}
