"use client"

import { ConnectButton } from "@rainbow-me/rainbowkit"
import Link from "next/link"
import { useSession } from "next-auth/react"

export function NavBar() {
  const { data: session } = useSession()

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950 px-6 h-14 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-bold text-white text-base tracking-tight">
          ⚽ BetChain
        </Link>
        {session && (
          <Link
            href="/bets"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            My Bets
          </Link>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-600 bg-zinc-900 px-2 py-1 rounded font-mono">
          Base Sepolia
        </span>
        <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
      </div>
    </nav>
  )
}
