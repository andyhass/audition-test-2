import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname.startsWith("/bets")) {
    return NextResponse.redirect(new URL("/", req.url))
  }
})

export const config = { matcher: ["/bets/:path*"] }
