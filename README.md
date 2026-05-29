# BetChain

A decentralized sports betting platform on Base Sepolia. Users authenticate with their Ethereum wallet via Sign In with Ethereum (SIWE), browse upcoming fixtures, and place fixed-odds bets denominated in USDC. Match results are fetched from TheSportsDB and settled on-chain by the platform operator.

---

## Quickstart

> A prefilled `.env.local` file is included. It contains a pre-configured Neon database, a deployed contract on Base Sepolia, and all required secrets. You can immediately bet on events/fixtures following the steps below.

1. Run the app — `pnpm install && cd contracts && pnpm install && cd .. && pnpm dev`
2. Navigate to http://localhost:3000
3. Connect your wallet
4. Choose an event and bet. Note: the contract has 4 USDC in liquidity — do not bet more than 4 USDC.
5. Manually settle the bet: `cd contracts && EVENT_ID=0 RESULT=0 pnpm settle:sepolia`
6. Sync the result to the database: `curl -X GET http://localhost:3000/api/cron/check-results -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"`
7. Reload **My Bets** to see the outcome.

To reset all data (clear the database and redeploy a fresh contract), run `pnpm reset`. The admin wallet (`ADMIN_PRIVATE_KEY` in `.env.local`) covers gas and liquidity automatically. To fund the admin wallet, send USDC to `0x08b75Eec22a2F16918Dade687aD7B1F737e43456`.

---

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- [MetaMask](https://metamask.io) browser extension
- Base Sepolia ETH for gas — [Coinbase faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
- Base Sepolia USDC for betting — [Circle faucet](https://faucet.circle.com) (select Base Sepolia)

---

## Architecture

- **Frontend** — Next.js 16 (App Router), React 19, Tailwind 4, RainbowKit + wagmi
- **Auth** — Sign In with Ethereum via Auth.js v5
- **Database** — Neon serverless Postgres via Drizzle ORM
- **Smart contract** — Solidity 0.8.24, deployed to Base Sepolia via Hardhat
- **Data source** — TheSportsDB API (fixtures and results)
- **Workers** — Two Vercel Cron jobs: hourly fixture sync, 5-minute result polling

### Data flow

```
TheSportsDB API
      │
      │  sync-events cron (hourly)
      ▼
  Database (Neon Postgres)          Smart Contract (Base Sepolia)
  ─────────────────────────         ─────────────────────────────
  leagues                           BettingPlatform.sol
  sports_events  ◄────────────────► on_chain_event_id links the two
  users                             events, bets, settlement state
  bet_cache
      │
      │  Server components / API routes
      ▼
  Frontend (Next.js)
  ─────────────────
  Events feed (reads DB)
  Bet modal (writes to contract via wagmi, then records in DB)
  My Bets (reads bet_cache from DB)
      │
      │  check-results cron (every 5 min)
      ▼
  TheSportsDB API → result → settle() on contract → update bet_cache
```

**Key relationships:**

- **Frontend ↔ Database** — server components query the DB directly via Drizzle ORM. The events feed, user preferences, and bet history are all served from Postgres without hitting the RPC on every page load.
- **Frontend ↔ Smart contract** — the bet modal uses wagmi/viem to write directly to the contract from the user's wallet. Two transactions are required: `approve` (grant the contract permission to spend USDC) and `placeBet` (execute the transfer and record the bet on-chain).
- **Database ↔ Smart contract** — the `on_chain_event_id` column links a DB event row to its on-chain counterpart. After a bet is placed on-chain, the frontend POSTs the tx hash and details to `/api/bets`, which writes a mirror row to `bet_cache`. This means the My Bets page can be served from Postgres without RPC calls.
- **Workers** — `sync-events` is the bridge from TheSportsDB into both the DB and the contract. `check-results` is the bridge from TheSportsDB back out: it detects finished matches, calls `settle()` on the contract (which transfers USDC to winners), and updates `bet_cache` so the UI reflects the outcome.

---

## Comprehensive Setup Guide

### 1. Install dependencies

```bash
pnpm install
cd contracts && pnpm install && cd ..
```

### 2. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Load fixtures

In a separate terminal, trigger the fixture sync:

```bash
curl -X GET http://localhost:3000/api/cron/sync-events \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

Reload the page — match cards for upcoming UCL and MLS fixtures will appear.

> Match cards are only clickable when registered on-chain. If a card appears greyed out after syncing, re-run the sync command — it will register any events that were missed.

### 4. Connect your wallet and place a bet

1. Click **Connect Wallet** in the top-right corner
2. Approve the Sign In with Ethereum prompt in MetaMask
3. Click an active match card
4. Pick a side (home or away)
5. Enter a USDC amount, or use a quick-pick button (10 / 25 / 50 / 100)
6. Click **Approve USDC** → confirm in MetaMask
7. Click **Place Bet** → confirm in MetaMask
8. Click **My Bets** in the nav to see your open position

### 5. Settle a bet (test without waiting for a real result)

Find the on-chain event ID for the match you bet on:

```bash
# Run this SQL in the Neon console or any Postgres client
SELECT home_team, away_team, on_chain_event_id FROM sports_events ORDER BY match_time;
```

Then settle it manually from the `contracts/` directory:

```bash
cd contracts
EVENT_ID=0 RESULT=0 pnpm settle:sepolia   # 0 = home win
EVENT_ID=0 RESULT=1 pnpm settle:sepolia   # 1 = away win
EVENT_ID=0 RESULT=2 pnpm settle:sepolia   # 2 = draw — refunds all bets
```

### 6. Sync the result to the database

```bash
curl -X GET http://localhost:3000/api/cron/check-results \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

Reload **My Bets** — your bet will show as **won**, **lost**, or **refunded**. Winning payouts are transferred automatically on-chain at the time of settlement.

### 7. Reset everything to a clean state

```bash
pnpm reset
```

This clears the database (bets, events, users), deploys a new `BettingPlatform.sol` contract, deposits liquidity, and updates `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env.local` automatically. Re-sync fixtures afterwards:

```bash
curl -X GET http://localhost:3000/api/cron/sync-events \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

> The admin wallet (`ADMIN_PRIVATE_KEY`) covers gas and liquidity for the reset. Your personal MetaMask wallet still needs Base Sepolia ETH and USDC to place bets.

---

## Full Local Setup

Follow this section if setting up from scratch without the provided `.env.local`.

### 1. Install dependencies

```bash
pnpm install
cd contracts && pnpm install && cd ..
```

### 2. Configure environment

Create `.env.local` in the project root:

```env
# Postgres (from Neon dashboard)
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Auth.js — generate with: openssl rand -base64 32
NEXTAUTH_SECRET=

# Protects cron endpoints — any random string
CRON_SECRET=

# Admin wallet private key (hex, with or without 0x prefix)
# This wallet owns the contract and calls createEvent/settle
ADMIN_PRIVATE_KEY=

# Base Sepolia config
NEXT_PUBLIC_CHAIN_ID=84532
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Set after deploying the contract (see below)
NEXT_PUBLIC_CONTRACT_ADDRESS=

# TheSportsDB API key (3 = free tier)
THESPORTSDB_API_KEY=3
```

### 3. Set up the database

```bash
pnpm db:push   # push schema to Neon
pnpm db:seed   # seed leagues (EPL, UCL, MLS)
```

### 4. Deploy the contract

```bash
cd contracts && pnpm deploy:sepolia
```

Copy the deployed address into `.env.local` as `NEXT_PUBLIC_CONTRACT_ADDRESS`.

### 5. Fund the contract with liquidity

Get testnet USDC from the [Circle faucet](https://faucet.circle.com), then deposit:

```bash
cd contracts && pnpm deposit:sepolia
```

### 6. Start the dev server

```bash
pnpm dev
```

---

## Resetting to a Clean State

```bash
pnpm reset
```

This will:
1. Truncate `bet_cache`, `sports_events`, and `users` (leagues are preserved)
2. Deploy a new `BettingPlatform.sol` contract to Base Sepolia
3. Deposit liquidity into the new contract
4. Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env.local` automatically
5. Trigger a fixture sync if the dev server is running

---

## Settling Results

### Automatic (production)

The `check-results` cron runs every 5 minutes. When a match finishes, it fetches the result from TheSportsDB, calls `settle()` on the contract, and updates bet statuses.

### Manual trigger

```bash
curl -X GET http://localhost:3000/api/cron/check-results \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### Manual settlement (testing)

```bash
cd contracts
EVENT_ID=0 RESULT=0 pnpm settle:sepolia   # 0 = home win
EVENT_ID=0 RESULT=1 pnpm settle:sepolia   # 1 = away win
EVENT_ID=0 RESULT=2 pnpm settle:sepolia   # 2 = draw (refunds all bets)
```

Then run `check-results` to sync the outcome back to the database.

---

## Smart Contract

Located in `contracts/`. `BettingPlatform.sol` is deployed to Base Sepolia and owned by the admin wallet specified in `ADMIN_PRIVATE_KEY`.

| Function | Access | Description |
|---|---|---|
| `createEvent` | Owner | Registers a match with teams, odds, and kick-off time |
| `updateOdds` | Owner | Updates odds before match start (does not affect existing bets) |
| `placeBet` | Public | Accepts USDC, locks odds at bet time |
| `settle` | Owner | Pays winners at snapshotted odds; draws refund both sides |
| `depositLiquidity` | Owner | Deposits USDC to cover potential payouts |
| `withdrawHouseFunds` | Owner | Withdraws accumulated margin after settlement |

Odds are stored in basis points: `18000` = 1.80×. Payout = `amount × oddsSnapshot / 10000`.

### Contract scripts

Run from the `contracts/` directory:

| Script | Description |
|---|---|
| `pnpm compile` | Compile Solidity |
| `pnpm test` | Run Hardhat tests (17 tests) |
| `pnpm deploy:sepolia` | Deploy to Base Sepolia |
| `pnpm deposit:sepolia` | Deposit USDC liquidity |
| `EVENT_ID=N RESULT=R pnpm settle:sepolia` | Manually settle an event |

---

## API Routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | — | Auth.js SIWE handler |
| `/api/events` | GET | — | All non-cancelled events with league info |
| `/api/preferences` | GET/PUT | Session | User timezone and league preferences |
| `/api/bets` | POST | Session | Record a bet after on-chain placement |
| `/api/cron/sync-events` | GET | CRON_SECRET | Fetch and register upcoming fixtures |
| `/api/cron/check-results` | GET | CRON_SECRET | Poll results and settle finished matches |

---

## Deployment

Push to GitHub, import the repo on [vercel.com](https://vercel.com), and add all `.env.local` variables to the Vercel project settings. The two cron jobs are configured in `vercel.json` and run automatically once deployed.
