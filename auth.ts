import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { SiweMessage } from "siwe"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { getAddress } from "viem"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        message: { type: "text" },
        signature: { type: "text" },
      },
      authorize: async (credentials) => {
        try {
          const message = new SiweMessage(
            JSON.parse(credentials.message as string)
          )
          const result = await message.verify({
            signature: credentials.signature as string,
          })
          if (!result.success) return null

          const address = getAddress(message.address)

          // Upsert user on first sign-in
          await db
            .insert(users)
            .values({ wallet_address: address })
            .onConflictDoNothing()

          return { id: address, address }
        } catch {
          return null
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) token.address = (user as { address: string }).address
      return token
    },
    session: ({ session, token }) => {
      session.user.address = token.address as string
      return session
    },
  },
  pages: { signIn: "/" },
})

declare module "next-auth" {
  interface Session {
    user: { address: string }
  }
}
