"use client"

import { useState } from "react"
import { EventCard, Event } from "./EventCard"
import { BetModal } from "./BetModal"

interface EventsListProps {
  events: Event[]
  userTimezone?: string
}

export function EventsList({ events, userTimezone }: EventsListProps) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)

  if (events.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600">
        No upcoming matches available.
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {events.map((e) => (
          <EventCard key={e.id} event={e} onBet={setSelectedEvent} userTimezone={userTimezone} />
        ))}
      </div>
      {selectedEvent && (
        <BetModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </>
  )
}
