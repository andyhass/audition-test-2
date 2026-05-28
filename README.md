# BetChain

A decentralized sports betting platform on Base Sepolia. Users authenticate with their Ethereum wallet via Sign In with Ethereum (SIWE), browse upcoming fixtures, and place fixed-odds bets denominated in USDC. Match results are fetched from TheSportsDB and settled on-chain by the platform operator.

## Architecture

- **Frontend** — Next.js 16 (App Router), React 19, Tailwind 4, RainbowKit + wagmi
- **Auth** — Sign In with Ethereum via Auth.js v5
- **Database** — Neon serverless Postgres via Drizzle ORM
- **Smart contract** — Solidity 0.8.24, deployed to Base Sepolia via Hardhat
- **Data source** — TheSportsDB API (fixtures and results)
- **Workers** — Two Vercel Cron jobs: hourly fixture sync, 5-minute result polling

## Prerequisites

- Node.js 20+
- pnpm
- A MetaMask (or compatible) wallet
- A [Neon](https://neon.tech) Postgres database
- A deployed instance of `BettingPlatform.sol` on Base Sepolia (see [Deploy the contract](#deploy-the-contract))
- Base Sepolia ETH for gas ([faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet))
- Base Sepolia USDC for betting and house liquidity ([Circle faucet](https://faucet.circle.com))

## Local Setup

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

# Chainlink (unused — settlement is operator-controlled)
CHAINLINK_SUBSCRIPTION_ID=
```

### 3. Set up the database

```bash
# Push schema to Neon
pnpm db:push

# Seed leagues (EPL, UCL, MLS)
pnpm db:seed
```

### 4. Deploy the contract

```bash
cd contracts
pnpm deploy:sepolia
```

Copy the deployed address into `.env.local` as `NEXT_PUBLIC_CONTRACT_ADDRESS`.

### 5. Fund the contract with liquidity

The contract must hold USDC to pay out winning bets. Get testnet USDC from the [Circle faucet](https://faucet.circle.com), then deposit into the contract:

```bash
cd contracts
pnpm deposit:sepolia   # deposits 5 USDC by default — edit DEPOSIT_AMOUNT_USDC to change
```

### 6. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Loading Fixtures

Fixtures are synced from TheSportsDB. Trigger a manual sync (the cron also runs this hourly in production):

```bash
curl -X GET http://localhost:3000/api/cron/sync-events \
  -H "Authorization: Bearer <CRON_SECRET>"
```

This fetches upcoming fixtures for all leagues in the database, registers each event on-chain, and stores it in Postgres. Reload the page to see the match cards.

**Note:** The EPL off-season runs June–July. If no EPL fixtures appear, UCL and MLS fixtures are seeded by default and will be synced automatically.

## Placing a Bet

1. Click **Connect Wallet** and sign the SIWE message in MetaMask
2. Click an active match card (requires `on_chain_event_id` — cards without one show as greyed out)
3. Pick a side (home or away)
4. Enter a USDC amount (or use a quick-pick button)
5. Click **Approve USDC** → confirm in MetaMask
6. Click **Place Bet** → confirm in MetaMask
7. Check **My Bets** to see your open position

## Settling Results

### Automatic (production)

The `check-results` cron runs every 5 minutes. When a match finishes, it fetches the result from TheSportsDB, calls `settle()` on the contract, and updates bet statuses.

### Manual trigger

```bash
curl -X GET http://localhost:3000/api/cron/check-results \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### Manual settlement (testing)

To settle an event with a specific result without waiting for TheSportsDB:

```bash
cd contracts

# Find the on_chain_event_id from your DB:
# SELECT home_team, away_team, on_chain_event_id FROM sports_events ORDER BY match_time;

EVENT_ID=0 RESULT=0 pnpm settle:sepolia   # 0 = home win
EVENT_ID=0 RESULT=1 pnpm settle:sepolia   # 1 = away win
EVENT_ID=0 RESULT=2 pnpm settle:sepolia   # 2 = draw (refunds all bets)
```

Then run check-results to sync the outcome back to the database.

## Smart Contract

Located in `contracts/`. The `BettingPlatform.sol` contract handles:

- **`createEvent`** — registers a match with home/away teams, odds (in basis points), and kick-off time
- **`placeBet`** — accepts USDC from a bettor, locks in odds at bet time
- **`settle`** — called by the owner with the result; pays winners at snapshotted odds, refunds all on a draw
- **`depositLiquidity`** — owner deposits USDC to cover potential payouts
- **`withdrawHouseFunds`** — owner withdraws accumulated margin after settlement

Odds are stored in basis points: `18000` = 1.80×. Payout = `amount × oddsSnapshot / 10000`.

### Contract scripts

Run from the `contracts/` directory:

| Script | Description |
|---|---|
| `pnpm compile` | Compile Solidity |
| `pnpm test` | Run Hardhat tests |
| `pnpm deploy:sepolia` | Deploy to Base Sepolia |
| `pnpm deposit:sepolia` | Deposit USDC liquidity |
| `EVENT_ID=N RESULT=R pnpm settle:sepolia` | Manually settle an event |

## API Routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | — | Auth.js SIWE handler |
| `/api/events` | GET | — | All non-cancelled events with league info |
| `/api/preferences` | GET/PUT | Session | User timezone and league preferences |
| `/api/bets` | POST | Session | Record a bet after on-chain placement |
| `/api/cron/sync-events` | GET | CRON_SECRET | Fetch and register upcoming fixtures |
| `/api/cron/check-results` | GET | CRON_SECRET | Poll results and settle finished matches |

## Deployment

Push to GitHub, import the repo on [vercel.com](https://vercel.com), and add all `.env.local` variables to the Vercel project settings. The two cron jobs are configured in `vercel.json` and run automatically once deployed.
