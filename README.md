# BetChain

A decentralized sports betting platform on Base Sepolia. Users authenticate with their Ethereum wallet via Sign In with Ethereum (SIWE), browse upcoming fixtures, and place fixed-odds bets denominated in USDC. Match results are fetched from TheSportsDB and settled on-chain by the platform operator.

---

## Quickstart

> The `.env.local` file has been shared with you separately. It contains a pre-configured Neon database, a deployed contract on Base Sepolia, and all required secrets. Follow these steps to run the app end-to-end.

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- [MetaMask](https://metamask.io) browser extension
- Base Sepolia ETH for gas — [Coinbase faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
- Base Sepolia USDC for betting — [Circle faucet](https://faucet.circle.com) (select Base Sepolia)

### 1. Install dependencies

```bash
pnpm install
cd contracts && pnpm install && cd ..
```

### 2. Place the .env.local file

Put the provided `.env.local` in the project root (next to `package.json`).

### 3. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Load fixtures

In a separate terminal, trigger the fixture sync:

```bash
curl -X GET http://localhost:3000/api/cron/sync-events \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

Reload the page — match cards for upcoming UCL and MLS fixtures will appear.

### 5. Connect your wallet and place a bet

1. Click **Connect Wallet** in the top-right corner
2. Approve the Sign In with Ethereum prompt in MetaMask
3. Click an active match card
4. Pick a side (home or away)
5. Enter a USDC amount, or use a quick-pick button (10 / 25 / 50 / 100)
6. Click **Approve USDC** → confirm in MetaMask
7. Click **Place Bet** → confirm in MetaMask
8. Click **My Bets** in the nav to see your open position

> Match cards are only clickable when they have been registered on-chain. If a card appears greyed out after syncing, re-run the sync command — it will register any events that were missed.

### 6. Settle a bet (test without waiting for a real result)

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

### 7. Sync the result to the database

```bash
curl -X GET http://localhost:3000/api/cron/check-results \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

Reload **My Bets** — your bet will show as **won**, **lost**, or **refunded**. Winning payouts are transferred automatically on-chain at the time of settlement.

### 8. Reset everything to a clean state

To wipe all data and start fresh with a new contract deployment:

```bash
pnpm reset
```

This clears the database (bets, events, users), deploys a new `BettingPlatform.sol` contract to Base Sepolia, and updates `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env.local` automatically. Afterwards, deposit liquidity into the new contract and re-sync fixtures:

```bash
cd contracts && pnpm deposit:sepolia && cd ..

curl -X GET http://localhost:3000/api/cron/sync-events \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

> The reviewer's wallet must hold Base Sepolia ETH to cover gas for the new deployment, and Base Sepolia USDC to deposit liquidity. Both are available from the faucets listed in [Prerequisites](#prerequisites).

---

## Architecture

- **Frontend** — Next.js 16 (App Router), React 19, Tailwind 4, RainbowKit + wagmi
- **Auth** — Sign In with Ethereum via Auth.js v5
- **Database** — Neon serverless Postgres via Drizzle ORM
- **Smart contract** — Solidity 0.8.24, deployed to Base Sepolia via Hardhat
- **Data source** — TheSportsDB API (fixtures and results)
- **Workers** — Two Vercel Cron jobs: hourly fixture sync, 5-minute result polling

---

## Full Local Setup

Follow this section if you are setting up the project from scratch without the provided `.env.local`.

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

# USDC on Base Sepolia (Circle official — do not change)
NEXT_PUBLIC_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

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

The contract must hold USDC to pay out winning bets. Get testnet USDC from the [Circle faucet](https://faucet.circle.com), then deposit:

```bash
cd contracts
pnpm deposit:sepolia   # deposits 5 USDC by default — edit DEPOSIT_AMOUNT_USDC to change
```

### 6. Start the dev server

```bash
pnpm dev
```

---

## Resetting to a Clean State

`pnpm reset` wipes all data and starts fresh with a new contract deployment:

```bash
pnpm reset
```

This will:
1. Truncate `bet_cache`, `sports_events`, and `users` in the database (leagues are preserved)
2. Deploy a new `BettingPlatform.sol` contract to Base Sepolia
3. Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env.local` automatically
4. Trigger a fixture sync if the dev server is running

After reset, deposit liquidity into the new contract:

```bash
cd contracts && pnpm deposit:sepolia
```

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

# Find the on_chain_event_id:
# SELECT home_team, away_team, on_chain_event_id FROM sports_events ORDER BY match_time;

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
