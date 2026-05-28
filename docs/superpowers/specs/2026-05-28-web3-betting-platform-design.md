# Web3 Betting Platform — Design Spec

**Date:** 2026-05-28  
**Status:** Approved

---

## Overview

A decentralized sports betting platform built on Next.js 16 (App Router). Users authenticate via Sign In with Ethereum (SIWE), browse English Premier League fixtures sourced from TheSportsDB, and place fixed-odds bets denominated in USDC on Base Sepolia. Settlement is trustless via Chainlink Functions. The entire application — frontend, API, workers, and smart contract toolchain — lives in a single repository and deploys to Vercel.

---

## Architecture

**Approach:** Integrated Next.js app (Vercel deployment). No separate services.

### Repository Layout

```
/
├── app/                        # Next.js App Router
│   ├── api/
│   │   ├── auth/[...nextauth]/ # Auth.js v5 SIWE handler
│   │   ├── cron/
│   │   │   ├── sync-events/    # Hourly fixture sync
│   │   │   └── check-results/  # 5-min result polling
│   │   ├── events/             # Events read API
│   │   └── preferences/        # User preferences API
│   ├── (app)/                  # Authenticated UI routes
│   │   ├── page.tsx            # Events feed
│   │   └── bets/page.tsx       # My bets
│   └── layout.tsx
├── contracts/                  # Hardhat project (standalone)
│   ├── contracts/
│   │   └── BettingPlatform.sol
│   ├── scripts/                # Deploy scripts
│   ├── test/
│   └── hardhat.config.ts
├── lib/
│   ├── db/                     # Drizzle ORM schema + Neon client
│   ├── contracts/              # ABIs + viem wallet client
│   └── wagmi/                  # wagmi + RainbowKit config
├── docs/
└── vercel.json                 # Cron schedule
```

### Key Dependencies

| Layer | Package |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind 4 |
| Auth | Auth.js v5, `siwe`, RainbowKit |
| Web3 client | wagmi, viem |
| Database | Neon (serverless Postgres), Drizzle ORM |
| Contracts | Hardhat, Solidity, OpenZeppelin, Chainlink Functions |
| Chain | Base Sepolia |
| Bet currency | USDC (Base Sepolia) |

---

## Database Schema

Managed via Drizzle ORM against a Neon serverless Postgres instance.

### `leagues`
Seeded on first deploy with EPL. Extensible for future sports.

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `name` | text | e.g. "English Premier League" |
| `sport` | text | e.g. "soccer" |
| `external_id` | text | TheSportsDB league ID e.g. "4328" |

### `sports_events`
Synced hourly from TheSportsDB. Keyed on `external_id` for upserts.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `external_id` | text unique | TheSportsDB event ID |
| `on_chain_event_id` | text | uint256 from contract; null until registered |
| `league_id` | integer FK | → `leagues.id` |
| `home_team` | text | |
| `away_team` | text | |
| `match_time` | timestamptz | Kick-off time |
| `status` | enum | `upcoming \| live \| completed \| cancelled` |
| `home_odds` | numeric(8,4) | Decimal multiplier e.g. 1.80 |
| `away_odds` | numeric(8,4) | Decimal multiplier e.g. 2.10 |
| `result` | enum | `home_win \| away_win \| draw \| pending` |

Sport is derived by joining `leagues` on `league_id` — it is not stored directly on the event.

### `users`
Created on first SIWE sign-in.

| Column | Type | Notes |
|---|---|---|
| `wallet_address` | text PK | Checksummed EVM address |
| `preferred_timezone` | text | IANA tz string e.g. "America/New_York" |
| `favorite_sports` | text[] | e.g. ["soccer"] |
| `top_leagues` | integer[] | FK references to `leagues.id` |

### `bet_cache`
Read mirror of on-chain bets, populated by indexing `BetPlaced` and `EventSettled` contract events. Bets are authoritative on-chain; this table exists for fast UI queries only.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tx_hash` | text | On-chain transaction hash |
| `wallet_address` | text | → `users.wallet_address` |
| `event_id` | uuid | → `sports_events.id` |
| `side` | enum | `home \| away` |
| `amount_usdc` | numeric(20,6) | |
| `odds_snapshot` | numeric(8,4) | Odds locked at bet time |
| `status` | enum | `pending \| won \| lost \| refunded` |

---

## Smart Contract: `BettingPlatform.sol`

Inherits `FunctionsClient` (Chainlink) and `Ownable` (OpenZeppelin). Deployed to Base Sepolia via Hardhat.

### Structs

**`SportEvent`**
- `id` (uint256), `homeTeam` (string), `awayTeam` (string)
- `homeOdds` (uint256) — basis points, e.g. 18000 = 1.80×
- `awayOdds` (uint256)
- `startTime` (uint256) — unix timestamp
- `status` (enum: OPEN, LOCKED, SETTLED, CANCELLED)
- `externalId` (string) — TheSportsDB event ID, passed to Chainlink Functions

**`Bet`**
- `bettor` (address), `side` (enum: HOME, AWAY)
- `amount` (uint256) — USDC in 6-decimal units
- `oddsSnapshot` (uint256) — basis points, locked at bet time
- `settled` (bool)

### Storage
- `mapping(uint256 => SportEvent) events`
- `mapping(uint256 => Bet[]) eventBets`
- `mapping(bytes32 => uint256) requestToEvent` — Chainlink request ID → event ID
- `IERC20 usdc` — USDC token address
- `uint64 subscriptionId` — Chainlink Functions subscription

### Key Functions

| Function | Access | Description |
|---|---|---|
| `depositLiquidity(amount)` | onlyOwner | Admin deposits USDC to back payouts |
| `createEvent(homeTeam, awayTeam, homeOdds, awayOdds, startTime, externalId)` | onlyOwner | Registers a new event, sets status = OPEN. Emits `EventCreated(uint256 indexed eventId)`. |
| `updateOdds(eventId, homeOdds, awayOdds)` | onlyOwner | Updates odds before `startTime`; does not affect existing bets |
| `placeBet(eventId, side, amount)` | public | Requires prior USDC `approve()`. Reverts if `block.timestamp >= startTime`. Snapshots current odds. Emits `BetPlaced`. |
| `requestSettlement(eventId)` | onlyOwner | Sends Chainlink Functions request with `externalId`. Stores `requestId → eventId`. |
| `fulfillRequest(requestId, response, err)` | Chainlink callback | Decodes result byte (0=HOME_WIN, 1=AWAY_WIN, 2=DRAW). Pays winners at snapshotted odds. Refunds both sides on draw. Emits `EventSettled`. |
| `withdrawHouseFunds()` | onlyOwner | Sweeps accumulated house margin after settlement |

### Odds & Payout Model
- Odds stored in basis points (1 decimal = 10000 bp). Payout = `amount * oddsSnapshot / 10000`.
- No bet caps per event or per user.
- Admin must deposit sufficient USDC liquidity before events open. Insolvency risk is the operator's responsibility.

### Draw Handling
On draw result: all bets for the event are refunded in full (original `amount`). No payout multiplier applied.

### Chainlink Functions Settlement Flow
1. Worker detects match ended in DB → calls `requestSettlement(eventId)` via admin wallet
2. Contract sends Chainlink Functions request; inline JS source fetches TheSportsDB by `externalId`
3. Chainlink DON executes JS, returns encoded byte: `0x00` = home win, `0x01` = away win, `0x02` = draw
4. `fulfillRequest` callback settles all bets for the event and emits `EventSettled`

---

## Authentication

**Stack:** Auth.js v5 with SIWE credentials provider + RainbowKit's built-in SIWE adapter.

**Flow:**
1. User clicks "Connect Wallet" — RainbowKit modal opens
2. Wallet connected → RainbowKit requests nonce from `GET /api/auth/nonce`
3. User signs SIWE message in wallet (domain, address, nonce, expiry)
4. `POST /api/auth/verify` — Auth.js verifies signature via `siwe` package
5. httpOnly session cookie issued; `session.user.address` = checksummed wallet address
6. `users` row upserted in DB on first sign-in

No JWT stored client-side. Protected API routes call `auth()` from Auth.js; unauthenticated requests return 401.

---

## Worker Jobs

Both are Next.js API route handlers (`POST`) protected by a `CRON_SECRET` header that Vercel injects automatically for cron calls.

### `POST /api/cron/sync-events`
**Schedule:** `0 * * * *` (every hour)

1. Fetch next 7 days of EPL fixtures from TheSportsDB (`/api/v1/json/{key}/eventsnextleague.php?id=4328`)
2. Upsert each fixture into `sports_events` keyed on `external_id`
3. For events not yet registered on-chain: call `createEvent()` via admin wallet; read the emitted `EventCreated(uint256 indexed eventId)` log from the receipt to get `on_chain_event_id`; store it in DB
4. If TheSportsDB returns odds: call `updateOdds()` on contract

### `POST /api/cron/check-results`
**Schedule:** `*/5 * * * *` (every 5 minutes)

1. Query DB for events with `status IN (upcoming, live)` where `match_time < now()`
2. Fetch current status from TheSportsDB for each
3. If result found: update DB `status = completed`, store `result`
4. Call `requestSettlement(on_chain_event_id)` on contract via admin wallet (Chainlink settlement is asynchronous — the callback fires minutes later)
5. On each run, also poll for recent `EventSettled` logs from the contract; for each settled event, update matching `bet_cache` rows to `won`, `lost`, or `refunded` based on the result

**Admin wallet:** Private key stored as `ADMIN_PRIVATE_KEY` env var, never exposed to client.

### `vercel.json`
```json
{
  "crons": [
    { "path": "/api/cron/sync-events",   "schedule": "0 * * * *" },
    { "path": "/api/cron/check-results", "schedule": "*/5 * * * *" }
  ]
}
```

---

## Frontend

### Pages

**`/` (unauthenticated):** Minimal landing. App name, one-line description, "Connect Wallet" button that opens the RainbowKit modal.

**`/` (authenticated):** Events feed. Card per open match showing home team, away team, kick-off time (rendered in user's preferred timezone), and odds for each side. Live matches displayed as grayed out with "Betting closed." Clicking a card opens the bet placement modal.

**`/bets`:** "My Bets" — list of the authenticated user's `bet_cache` rows with status (pending / won / lost / refunded).

### Bet Placement Modal
1. Pick side (home or away) — selected side highlighted
2. Enter USDC amount — quick-pick buttons (10, 25, 50, 100)
3. Potential payout shown live (`amount × oddsSnapshot`)
4. Two-step transaction: "Approve USDC" → wallet prompt → "Place Bet" → wallet prompt
5. Odds locked at the moment the bet is submitted

### Component Stack
- RainbowKit for wallet connection and SIWE
- wagmi hooks for reading contract state and writing transactions
- viem for admin-side contract calls (server only)
- Tailwind 4 for styling

---

## Environment Variables

| Variable | Where used |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `NEXTAUTH_SECRET` | Auth.js session encryption |
| `CRON_SECRET` | Protects cron endpoints |
| `ADMIN_PRIVATE_KEY` | Server-only; admin wallet for contract writes |
| `NEXT_PUBLIC_CHAIN_ID` | Base Sepolia chain ID (84532) |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Deployed BettingPlatform address |
| `NEXT_PUBLIC_USDC_ADDRESS` | USDC on Base Sepolia |
| `CHAINLINK_SUBSCRIPTION_ID` | Chainlink Functions subscription |
| `THESPORTSDB_API_KEY` | TheSportsDB API key |

---

## Out of Scope (MVP)

- Draw as a bettable outcome (draws refund both sides)
- Multiple sports / leagues beyond EPL (data model supports it; UI and workers are EPL-only)
- Bet caps (no per-event or per-user limits)
- Mobile-optimized UI
- Real-money / mainnet deployment
