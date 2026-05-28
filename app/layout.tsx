import type { Metadata } from "next"
import { Geist } from "next/font/google"
import { Providers } from "@/components/Providers"
import { auth } from "@/auth"
import "./globals.css"

const geist = Geist({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "BetChain",
  description: "Decentralized EPL betting on Base",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <html lang="en" className="dark">
      <body className={`${geist.className} bg-zinc-950 text-zinc-100 min-h-screen`}>
        <Providers session={session}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
