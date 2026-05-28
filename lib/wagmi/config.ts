import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { baseSepolia } from "wagmi/chains"

export const wagmiConfig = getDefaultConfig({
  appName: "BetChain",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "placeholder",
  chains: [baseSepolia],
  ssr: true,
})
