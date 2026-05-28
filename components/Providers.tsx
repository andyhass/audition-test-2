"use client"

import {
  RainbowKitProvider,
  darkTheme,
  createAuthenticationAdapter,
  RainbowKitAuthenticationProvider,
} from "@rainbow-me/rainbowkit"
import type { AuthenticationStatus } from "@rainbow-me/rainbowkit"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SessionProvider } from "next-auth/react"
import { useState } from "react"
import { SiweMessage } from "siwe"
import { signIn, signOut, getCsrfToken } from "next-auth/react"
import { wagmiConfig } from "@/lib/wagmi/config"

import "@rainbow-me/rainbowkit/styles.css"

const queryClient = new QueryClient()

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode
  session: any
}) {
  const [authStatus, setAuthStatus] = useState<AuthenticationStatus>("unauthenticated")

  const authAdapter = createAuthenticationAdapter({
    getNonce: async () => {
      const nonce = await getCsrfToken()
      return nonce ?? ""
    },

    createMessage: ({ nonce, address, chainId }) => {
      return new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to BetChain.",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      })
    },

    verify: async ({ message, signature }) => {
      const result = await signIn("credentials", {
        message: JSON.stringify(message),
        signature,
        redirect: false,
      })
      const ok = result?.ok === true
      setAuthStatus(ok ? "authenticated" : "unauthenticated")
      return ok
    },

    signOut: async () => {
      await signOut({ redirect: false })
      setAuthStatus("unauthenticated")
    },
  })

  return (
    <SessionProvider session={session}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitAuthenticationProvider adapter={authAdapter} status={authStatus}>
            <RainbowKitProvider theme={darkTheme()}>
              {children}
            </RainbowKitProvider>
          </RainbowKitAuthenticationProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </SessionProvider>
  )
}
