# Web3 Betting Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a decentralized EPL sports betting platform where users authenticate via SIWE, view fixtures synced from TheSportsDB, and place fixed-odds USDC bets settled by Chainlink Functions on Base Sepolia.

**Architecture:** Integrated Next.js 16 App Router app. Smart contracts live in `/contracts` (Hardhat). Database uses Neon serverless Postgres via Drizzle ORM. Two Vercel Cron jobs handle fixture sync and result polling. The frontend uses RainbowKit + wagmi for wallet/SIWE, Tailwind 4 for styling.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Auth.js v5, siwe, RainbowKit, wagmi, viem, Drizzle ORM, Neon Postgres, Hardhat, Solidity 0.8.24, OpenZeppelin, Chainlink Functions, USDC on Base Sepolia.

> **Before starting:** Read `node_modules/next/dist/docs/` for any breaking changes relevant to your task. The spec is at `docs/superpowers/specs/2026-05-28-web3-betting-platform-design.md`.

---

## File Map

```
/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts    # Auth.js v5 handler
│   │   ├── cron/
│   │   │   ├── sync-events/route.ts       # Hourly fixture sync
│   │   │   └── check-results/route.ts     # 5-min result polling
│   │   ├── events/route.ts                # GET /api/events
│   │   └── preferences/route.ts           # GET/PUT /api/preferences
│   ├── bets/page.tsx                      # My Bets page
│   ├── layout.tsx                         # Root layout with Providers
│   └── page.tsx                           # Events feed (home)
├── components/
│   ├── Providers.tsx                      # wagmi + RainbowKit + SessionProvider
│   ├── NavBar.tsx                         # Wallet connect + nav
│   ├── EventCard.tsx                      # Single match card
│   ├── EventsList.tsx                     # Events feed container
│   ├── BetModal.tsx                       # Bet placement modal
│   └── BetList.tsx                        # My bets list
├── contracts/
│   ├── contracts/
│   │   ├── BettingPlatform.sol            # Main contract
│   │   ├── mocks/MockERC20.sol            # Test USDC
│   │   └── mocks/MockFunctionsRouter.sol  # Test Chainlink router
│   ├── scripts/
│   │   └── deploy.ts                      # Deploy + configure script
│   ├── test/
│   │   └── BettingPlatform.test.ts        # Hardhat tests
│   ├── functions-source.js                # Chainlink Functions JS source
│   ├── hardhat.config.ts
│   └── package.json
├── lib/
│   ├── db/
│   │   ├── index.ts                       # Neon client + Drizzle instance
│   │   └── schema.ts                      # All table definitions
│   ├── contracts/
│   │   ├── abi.ts                         # BettingPlatform ABI
│   │   └── client.ts                      # viem wallet client (server-only)
│   └── wagmi/
│       └── config.ts                      # wagmi + RainbowKit config
├── auth.ts                                # Auth.js v5 config
├── middleware.ts                          # Protect /bets route
├── drizzle.config.ts                      # Drizzle Kit config
├── vercel.json                            # Cron config
└── .env.local                             # Local env vars (gitignored)
```

---

## Phase 1: Smart Contracts

### Task 1: Hardhat project setup

**Files:**
- Create: `contracts/package.json`
- Create: `contracts/hardhat.config.ts`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Create contracts package.json**

```json
{
  "name": "@betting/contracts",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test",
    "deploy:sepolia": "hardhat run scripts/deploy.ts --network baseSepolia"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^5.0.0",
    "hardhat": "^2.22.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0"
  },
  "dependencies": {
    "@chainlink/contracts": "^1.3.0",
    "@openzeppelin/contracts": "^5.0.0"
  }
}
```

- [ ] **Step 2: Install contracts dependencies**

```bash
cd contracts && pnpm install
```

Expected: Packages installed, `contracts/node_modules/` created.

- [ ] **Step 3: Add contracts to pnpm workspace**

Read `pnpm-workspace.yaml`, then replace its contents with:

```yaml
packages:
  - "."
  - "contracts"
```

- [ ] **Step 4: Create hardhat.config.ts**

```typescript
import { HardhatUserConfig } from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.ADMIN_PRIVATE_KEY ? [process.env.ADMIN_PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    artifacts: "./artifacts",
  },
}

export default config
```

- [ ] **Step 5: Compile to verify setup**

```bash
cd contracts && pnpm compile
```

Expected: `Compiled 0 Solidity files` (no contracts yet — that's fine).

- [ ] **Step 6: Commit**

```bash
git add contracts/ pnpm-workspace.yaml
git commit -m "feat: add hardhat project scaffold"
```

---

### Task 2: Mock contracts for testing

**Files:**
- Create: `contracts/contracts/mocks/MockERC20.sol`
- Create: `contracts/contracts/mocks/MockFunctionsRouter.sol`

- [ ] **Step 1: Write MockERC20.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name, string memory symbol, uint8 decimals_)
        ERC20(name, symbol)
    {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

- [ ] **Step 2: Write MockFunctionsRouter.sol**

This mock lets tests simulate Chainlink callbacks by calling `fulfillRequest` directly.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFunctionsConsumer {
    function handleOracleFulfillment(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external;
}

contract MockFunctionsRouter {
    uint256 private requestCounter;
    mapping(bytes32 => address) public requestConsumer;

    function sendRequest(
        uint64, /* subscriptionId */
        bytes calldata, /* data */
        uint16, /* dataVersion */
        uint32, /* callbackGasLimit */
        bytes32 /* donId */
    ) external returns (bytes32 requestId) {
        requestId = bytes32(++requestCounter);
        requestConsumer[requestId] = msg.sender;
    }

    function fulfillRequest(bytes32 requestId, bytes calldata response) external {
        address consumer = requestConsumer[requestId];
        require(consumer != address(0), "Unknown request");
        IFunctionsConsumer(consumer).handleOracleFulfillment(requestId, response, "");
    }

    function isValidCallbackGasLimit(uint64, uint32) external pure returns (bool) {
        return true;
    }
}
```

- [ ] **Step 3: Compile**

```bash
cd contracts && pnpm compile
```

Expected: `Compiled 2 Solidity files successfully`.

- [ ] **Step 4: Commit**

```bash
git add contracts/contracts/mocks/
git commit -m "feat: add mock contracts for testing"
```

---

### Task 3: BettingPlatform.sol — structs, storage, events

**Files:**
- Create: `contracts/contracts/BettingPlatform.sol`
- Create: `contracts/test/BettingPlatform.test.ts`

- [ ] **Step 1: Write the failing test for contract deployment**

Create `contracts/test/BettingPlatform.test.ts`:

```typescript
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import hre from "hardhat"

describe("BettingPlatform", function () {
  async function deployFixture() {
    const [owner, bettor, other] = await hre.ethers.getSigners()

    const MockERC20 = await hre.ethers.getContractFactory("MockERC20")
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6)

    const MockRouter = await hre.ethers.getContractFactory("MockFunctionsRouter")
    const router = await MockRouter.deploy()

    const source = `
      const id = args[0];
      const r = await Functions.makeHttpRequest({url: \`https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=\${id}\`});
      const e = r.data.events[0];
      if (!e || e.strStatus !== 'Match Finished') throw Error('not finished');
      const h = parseInt(e.intHomeScore), a = parseInt(e.intAwayScore);
      return new Uint8Array([h > a ? 0 : a > h ? 1 : 2]);
    `

    const BettingPlatform = await hre.ethers.getContractFactory("BettingPlatform")
    const platform = await BettingPlatform.deploy(
      await router.getAddress(),
      await usdc.getAddress(),
      1n,
      source
    )

    return { platform, usdc, router, owner, bettor, other }
  }

  describe("deployment", function () {
    it("sets the USDC token address", async function () {
      const { platform, usdc } = await loadFixture(deployFixture)
      expect(await platform.usdc()).to.equal(await usdc.getAddress())
    })

    it("sets the owner", async function () {
      const { platform, owner } = await loadFixture(deployFixture)
      expect(await platform.owner()).to.equal(owner.address)
    })

    it("starts with nextEventId = 0", async function () {
      const { platform } = await loadFixture(deployFixture)
      expect(await platform.nextEventId()).to.equal(0n)
    })
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd contracts && pnpm test
```

Expected: FAIL — `Error: No contract factory for 'BettingPlatform'`

- [ ] **Step 3: Write BettingPlatform.sol — structs and storage only**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BettingPlatform is FunctionsClient, Ownable {
    using FunctionsRequest for FunctionsRequest.Request;
    using SafeERC20 for IERC20;

    enum EventStatus { OPEN, LOCKED, SETTLED, CANCELLED }
    enum BetSide { HOME, AWAY }

    struct SportEvent {
        uint256 id;
        string homeTeam;
        string awayTeam;
        uint256 homeOdds;   // basis points: 18000 = 1.80x
        uint256 awayOdds;
        uint256 startTime;
        EventStatus status;
        string externalId;  // TheSportsDB event ID
    }

    struct Bet {
        address bettor;
        BetSide side;
        uint256 amount;         // USDC in 6-decimal units
        uint256 oddsSnapshot;   // basis points, locked at bet time
        bool settled;
    }

    IERC20 public immutable usdc;
    uint64 public subscriptionId;
    uint32 public constant GAS_LIMIT = 300_000;
    bytes32 public constant DON_ID =
        0x66756e2d626173652d7365706f6c69612d310000000000000000000000000000;

    string public functionsSource;

    uint256 public nextEventId;
    mapping(uint256 => SportEvent) public events;
    mapping(uint256 => Bet[]) public eventBets;
    mapping(bytes32 => uint256) public requestToEvent;

    event EventCreated(uint256 indexed eventId, string homeTeam, string awayTeam);
    event OddsUpdated(uint256 indexed eventId, uint256 homeOdds, uint256 awayOdds);
    event BetPlaced(
        uint256 indexed eventId,
        address indexed bettor,
        BetSide side,
        uint256 amount,
        uint256 oddsSnapshot
    );
    event SettlementRequested(uint256 indexed eventId, bytes32 requestId);
    event EventSettled(uint256 indexed eventId, uint8 result);

    constructor(
        address router,
        address _usdc,
        uint64 _subscriptionId,
        string memory _functionsSource
    ) FunctionsClient(router) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        subscriptionId = _subscriptionId;
        functionsSource = _functionsSource;
    }

    function fulfillRequest(
        bytes32, /* requestId */
        bytes memory, /* response */
        bytes memory /* err */
    ) internal override {}
}
```

- [ ] **Step 4: Compile and run tests**

```bash
cd contracts && pnpm test
```

Expected: All 3 deployment tests PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/contracts/BettingPlatform.sol contracts/test/BettingPlatform.test.ts
git commit -m "feat: add BettingPlatform structs, storage, and deployment test"
```

---

### Task 4: BettingPlatform.sol — admin functions

**Files:**
- Modify: `contracts/contracts/BettingPlatform.sol`
- Modify: `contracts/test/BettingPlatform.test.ts`

- [ ] **Step 1: Write failing tests for admin functions**

Add this `describe` block to `contracts/test/BettingPlatform.test.ts` (inside the top-level `describe`, after the "deployment" block):

```typescript
  describe("depositLiquidity", function () {
    it("transfers USDC from owner to contract", async function () {
      const { platform, usdc, owner } = await loadFixture(deployFixture)
      await usdc.mint(owner.address, 1000n * 10n ** 6n)
      await usdc.approve(await platform.getAddress(), 1000n * 10n ** 6n)
      await platform.depositLiquidity(1000n * 10n ** 6n)
      expect(await usdc.balanceOf(await platform.getAddress())).to.equal(1000n * 10n ** 6n)
    })

    it("reverts if called by non-owner", async function () {
      const { platform, usdc, bettor } = await loadFixture(deployFixture)
      await usdc.mint(bettor.address, 100n * 10n ** 6n)
      await expect(
        platform.connect(bettor).depositLiquidity(100n * 10n ** 6n)
      ).to.be.revertedWithCustomError(platform, "OwnableUnauthorizedAccount")
    })
  })

  describe("createEvent", function () {
    it("stores the event and increments nextEventId", async function () {
      const { platform } = await loadFixture(deployFixture)
      const startTime = Math.floor(Date.now() / 1000) + 3600
      await platform.createEvent("Arsenal", "Chelsea", 18000n, 21000n, BigInt(startTime), "1234567")
      expect(await platform.nextEventId()).to.equal(1n)
      const evt = await platform.events(0n)
      expect(evt.homeTeam).to.equal("Arsenal")
      expect(evt.awayTeam).to.equal("Chelsea")
      expect(evt.homeOdds).to.equal(18000n)
      expect(evt.externalId).to.equal("1234567")
    })

    it("emits EventCreated", async function () {
      const { platform } = await loadFixture(deployFixture)
      const startTime = Math.floor(Date.now() / 1000) + 3600
      await expect(
        platform.createEvent("Arsenal", "Chelsea", 18000n, 21000n, BigInt(startTime), "1234567")
      ).to.emit(platform, "EventCreated").withArgs(0n, "Arsenal", "Chelsea")
    })
  })

  describe("updateOdds", function () {
    async function withEventFixture() {
      const base = await loadFixture(deployFixture)
      const startTime = Math.floor(Date.now() / 1000) + 3600
      await base.platform.createEvent("Arsenal", "Chelsea", 18000n, 21000n, BigInt(startTime), "1234567")
      return { ...base, startTime }
    }

    it("updates odds on an open event", async function () {
      const { platform } = await loadFixture(withEventFixture)
      await platform.updateOdds(0n, 17500n, 22000n)
      const evt = await platform.events(0n)
      expect(evt.homeOdds).to.equal(17500n)
      expect(evt.awayOdds).to.equal(22000n)
    })

    it("reverts if match has already started", async function () {
      const { platform } = await loadFixture(withEventFixture)
      await hre.ethers.provider.send("evm_increaseTime", [7200])
      await hre.ethers.provider.send("evm_mine", [])
      await expect(platform.updateOdds(0n, 17500n, 22000n)).to.be.revertedWith("Match started")
    })
  })
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
cd contracts && pnpm test
```

Expected: 6 new tests FAIL — functions not yet implemented.

- [ ] **Step 3: Implement depositLiquidity, createEvent, updateOdds in BettingPlatform.sol**

Add these functions after the constructor (before `fulfillRequest`):

```solidity
    function depositLiquidity(uint256 amount) external onlyOwner {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    function createEvent(
        string calldata homeTeam,
        string calldata awayTeam,
        uint256 homeOdds,
        uint256 awayOdds,
        uint256 startTime,
        string calldata externalId
    ) external onlyOwner returns (uint256 eventId) {
        eventId = nextEventId++;
        events[eventId] = SportEvent({
            id: eventId,
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            homeOdds: homeOdds,
            awayOdds: awayOdds,
            startTime: startTime,
            status: EventStatus.OPEN,
            externalId: externalId
        });
        emit EventCreated(eventId, homeTeam, awayTeam);
    }

    function updateOdds(
        uint256 eventId,
        uint256 homeOdds,
        uint256 awayOdds
    ) external onlyOwner {
        SportEvent storage evt = events[eventId];
        require(evt.status == EventStatus.OPEN, "Not open");
        require(block.timestamp < evt.startTime, "Match started");
        evt.homeOdds = homeOdds;
        evt.awayOdds = awayOdds;
        emit OddsUpdated(eventId, homeOdds, awayOdds);
    }

    function withdrawHouseFunds() external onlyOwner {
        usdc.safeTransfer(owner(), usdc.balanceOf(address(this)));
    }
```

- [ ] **Step 4: Run tests**

```bash
cd contracts && pnpm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/
git commit -m "feat: implement depositLiquidity, createEvent, updateOdds"
```

---

### Task 5: BettingPlatform.sol — placeBet

**Files:**
- Modify: `contracts/contracts/BettingPlatform.sol`
- Modify: `contracts/test/BettingPlatform.test.ts`

- [ ] **Step 1: Write failing tests for placeBet**

Add this `describe` block to `BettingPlatform.test.ts`:

```typescript
  describe("placeBet", function () {
    async function withOpenEventFixture() {
      const base = await loadFixture(deployFixture)
      const { platform, usdc, owner, bettor } = base
      const startTime = BigInt(Math.floor(Date.now() / 1000) + 7200)

      // Fund house liquidity
      await usdc.mint(owner.address, 10000n * 10n ** 6n)
      await usdc.approve(await platform.getAddress(), 10000n * 10n ** 6n)
      await platform.depositLiquidity(5000n * 10n ** 6n)

      await platform.createEvent("Arsenal", "Chelsea", 18000n, 21000n, startTime, "1234567")

      // Fund bettor
      await usdc.mint(bettor.address, 500n * 10n ** 6n)
      await usdc.connect(bettor).approve(await platform.getAddress(), 500n * 10n ** 6n)

      return { ...base, startTime }
    }

    it("records the bet and transfers USDC", async function () {
      const { platform, usdc, bettor } = await loadFixture(withOpenEventFixture)
      const before = await usdc.balanceOf(await platform.getAddress())
      await platform.connect(bettor).placeBet(0n, 0, 100n * 10n ** 6n) // 0 = HOME
      const after = await usdc.balanceOf(await platform.getAddress())
      expect(after - before).to.equal(100n * 10n ** 6n)

      const bets = await platform.getBets(0n)
      expect(bets.length).to.equal(1)
      expect(bets[0].bettor).to.equal(bettor.address)
      expect(bets[0].side).to.equal(0) // HOME
      expect(bets[0].amount).to.equal(100n * 10n ** 6n)
      expect(bets[0].oddsSnapshot).to.equal(18000n)
      expect(bets[0].settled).to.equal(false)
    })

    it("emits BetPlaced", async function () {
      const { platform, bettor } = await loadFixture(withOpenEventFixture)
      await expect(
        platform.connect(bettor).placeBet(0n, 0, 100n * 10n ** 6n)
      ).to.emit(platform, "BetPlaced")
        .withArgs(0n, bettor.address, 0, 100n * 10n ** 6n, 18000n)
    })

    it("reverts if match has started", async function () {
      const { platform, bettor } = await loadFixture(withOpenEventFixture)
      await hre.ethers.provider.send("evm_increaseTime", [10000])
      await hre.ethers.provider.send("evm_mine", [])
      await expect(
        platform.connect(bettor).placeBet(0n, 0, 100n * 10n ** 6n)
      ).to.be.revertedWith("Match already started")
    })

    it("reverts with zero amount", async function () {
      const { platform, bettor } = await loadFixture(withOpenEventFixture)
      await expect(
        platform.connect(bettor).placeBet(0n, 0, 0n)
      ).to.be.revertedWith("Amount must be positive")
    })
  })
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd contracts && pnpm test
```

Expected: 4 new tests FAIL.

- [ ] **Step 3: Implement placeBet and getBets in BettingPlatform.sol**

Add these functions (after `withdrawHouseFunds`, before `fulfillRequest`):

```solidity
    function placeBet(uint256 eventId, BetSide side, uint256 amount) external {
        SportEvent storage evt = events[eventId];
        require(evt.status == EventStatus.OPEN, "Betting not open");
        require(block.timestamp < evt.startTime, "Match already started");
        require(amount > 0, "Amount must be positive");

        uint256 odds = side == BetSide.HOME ? evt.homeOdds : evt.awayOdds;

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        eventBets[eventId].push(Bet({
            bettor: msg.sender,
            side: side,
            amount: amount,
            oddsSnapshot: odds,
            settled: false
        }));

        emit BetPlaced(eventId, msg.sender, side, amount, odds);
    }

    function getBets(uint256 eventId) external view returns (Bet[] memory) {
        return eventBets[eventId];
    }
```

- [ ] **Step 4: Run tests**

```bash
cd contracts && pnpm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/
git commit -m "feat: implement placeBet with USDC transfer and snapshot"
```

---

### Task 6: BettingPlatform.sol — requestSettlement and fulfillRequest

**Files:**
- Modify: `contracts/contracts/BettingPlatform.sol`
- Modify: `contracts/test/BettingPlatform.test.ts`

- [ ] **Step 1: Write failing tests for settlement**

Add this `describe` block to `BettingPlatform.test.ts`:

```typescript
  describe("settlement", function () {
    async function withBetsFixture() {
      const base = await loadFixture(deployFixture)
      const { platform, usdc, owner, bettor, other } = base
      const startTime = BigInt(Math.floor(Date.now() / 1000) + 7200)

      await usdc.mint(owner.address, 10000n * 10n ** 6n)
      await usdc.approve(await platform.getAddress(), 10000n * 10n ** 6n)
      await platform.depositLiquidity(5000n * 10n ** 6n)
      await platform.createEvent("Arsenal", "Chelsea", 18000n, 21000n, startTime, "1234567")

      await usdc.mint(bettor.address, 500n * 10n ** 6n)
      await usdc.connect(bettor).approve(await platform.getAddress(), 500n * 10n ** 6n)
      await platform.connect(bettor).placeBet(0n, 0, 100n * 10n ** 6n) // HOME bet

      await usdc.mint(other.address, 500n * 10n ** 6n)
      await usdc.connect(other).approve(await platform.getAddress(), 500n * 10n ** 6n)
      await platform.connect(other).placeBet(0n, 1, 50n * 10n ** 6n)  // AWAY bet

      return { ...base, startTime }
    }

    it("pays home winner at snapshotted odds on home win", async function () {
      const { platform, router, usdc, bettor } = await loadFixture(withBetsFixture)
      const tx = await platform.requestSettlement(0n)
      const receipt = await tx.wait()
      const event = receipt!.logs.find((l: any) => {
        try { return platform.interface.parseLog(l)?.name === "SettlementRequested" } catch { return false }
      })
      const parsed = platform.interface.parseLog(event!)!
      const requestId = parsed.args.requestId

      const bettorBefore = await usdc.balanceOf(bettor.address)
      // 0x00 = home win
      await router.fulfillRequest(requestId, "0x00")
      const bettorAfter = await usdc.balanceOf(bettor.address)
      // 100 USDC * 18000 / 10000 = 180 USDC payout
      expect(bettorAfter - bettorBefore).to.equal(180n * 10n ** 6n)
    })

    it("refunds both sides on draw", async function () {
      const { platform, router, usdc, bettor, other } = await loadFixture(withBetsFixture)
      const tx = await platform.requestSettlement(0n)
      const receipt = await tx.wait()
      const event = receipt!.logs.find((l: any) => {
        try { return platform.interface.parseLog(l)?.name === "SettlementRequested" } catch { return false }
      })
      const requestId = platform.interface.parseLog(event!)!.args.requestId

      const bettorBefore = await usdc.balanceOf(bettor.address)
      const otherBefore = await usdc.balanceOf(other.address)
      // 0x02 = draw
      await router.fulfillRequest(requestId, "0x02")
      expect(await usdc.balanceOf(bettor.address) - bettorBefore).to.equal(100n * 10n ** 6n)
      expect(await usdc.balanceOf(other.address) - otherBefore).to.equal(50n * 10n ** 6n)
    })

    it("emits EventSettled", async function () {
      const { platform, router } = await loadFixture(withBetsFixture)
      const tx = await platform.requestSettlement(0n)
      const receipt = await tx.wait()
      const event = receipt!.logs.find((l: any) => {
        try { return platform.interface.parseLog(l)?.name === "SettlementRequested" } catch { return false }
      })
      const requestId = platform.interface.parseLog(event!)!.args.requestId
      await expect(router.fulfillRequest(requestId, "0x01"))
        .to.emit(platform, "EventSettled").withArgs(0n, 1)
    })
  })
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd contracts && pnpm test
```

Expected: 3 new tests FAIL — `requestSettlement` not implemented.

- [ ] **Step 3: Implement requestSettlement and fulfillRequest in BettingPlatform.sol**

Replace the empty `fulfillRequest` stub and add `requestSettlement`:

```solidity
    function requestSettlement(uint256 eventId) external onlyOwner {
        SportEvent storage evt = events[eventId];
        require(
            evt.status == EventStatus.OPEN || evt.status == EventStatus.LOCKED,
            "Already settled"
        );
        evt.status = EventStatus.LOCKED;

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(functionsSource);
        string[] memory args = new string[](1);
        args[0] = evt.externalId;
        req.setArgs(args);

        bytes32 requestId = _sendRequest(req.encodeCBOR(), subscriptionId, GAS_LIMIT, DON_ID);
        requestToEvent[requestId] = eventId;
        emit SettlementRequested(eventId, requestId);
    }

    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory /* err */
    ) internal override {
        uint256 eventId = requestToEvent[requestId];
        uint8 result = uint8(response[0]); // 0=home win, 1=away win, 2=draw

        events[eventId].status = EventStatus.SETTLED;
        Bet[] storage bets = eventBets[eventId];

        for (uint256 i = 0; i < bets.length; i++) {
            Bet storage bet = bets[i];
            if (bet.settled) continue;
            bet.settled = true;

            if (result == 2) {
                usdc.safeTransfer(bet.bettor, bet.amount);
            } else {
                bool won = (result == 0 && bet.side == BetSide.HOME) ||
                           (result == 1 && bet.side == BetSide.AWAY);
                if (won) {
                    uint256 payout = (bet.amount * bet.oddsSnapshot) / 10_000;
                    usdc.safeTransfer(bet.bettor, payout);
                }
            }
        }

        emit EventSettled(eventId, result);
    }
```

- [ ] **Step 4: Run all tests**

```bash
cd contracts && pnpm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/
git commit -m "feat: implement Chainlink Functions settlement with draw refunds"
```

---

### Task 7: Chainlink Functions source + deploy script

**Files:**
- Create: `contracts/functions-source.js`
- Create: `contracts/scripts/deploy.ts`

- [ ] **Step 1: Write functions-source.js**

This JavaScript runs inside the Chainlink DON to fetch the match result.

```javascript
// contracts/functions-source.js
// Runs inside Chainlink DON. args[0] = TheSportsDB event ID.
const eventId = args[0];
const apiKey = secrets?.apiKey ?? "3";

const response = await Functions.makeHttpRequest({
  url: `https://www.thesportsdb.com/api/v1/json/${apiKey}/lookupevent.php?id=${eventId}`,
});

if (response.error) throw new Error("API request failed");

const event = response.data?.events?.[0];
if (!event) throw new Error("Event not found");
if (event.strStatus !== "Match Finished") throw new Error("Match not finished yet");

const homeScore = parseInt(event.intHomeScore);
const awayScore = parseInt(event.intAwayScore);

let result;
if (homeScore > awayScore) result = 0;      // home win
else if (awayScore > homeScore) result = 1;  // away win
else result = 2;                             // draw

return new Uint8Array([result]);
```

- [ ] **Step 2: Write deploy.ts**

```typescript
// contracts/scripts/deploy.ts
import hre from "hardhat"
import { readFileSync } from "fs"
import { join } from "path"

// Base Sepolia Chainlink Functions Router
const CHAINLINK_ROUTER = "0xf9B8fc078197181C841c296C876945aaa425B278"
// USDC on Base Sepolia (Circle official)
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

async function main() {
  const subscriptionId = process.env.CHAINLINK_SUBSCRIPTION_ID
  if (!subscriptionId) throw new Error("CHAINLINK_SUBSCRIPTION_ID required")

  const source = readFileSync(join(__dirname, "../functions-source.js"), "utf8")

  console.log("Deploying BettingPlatform...")
  const BettingPlatform = await hre.ethers.getContractFactory("BettingPlatform")
  const platform = await BettingPlatform.deploy(
    CHAINLINK_ROUTER,
    USDC_BASE_SEPOLIA,
    BigInt(subscriptionId),
    source
  )
  await platform.waitForDeployment()
  const address = await platform.getAddress()
  console.log(`BettingPlatform deployed to: ${address}`)
  console.log("")
  console.log("Next steps:")
  console.log(`  1. Add NEXT_PUBLIC_CONTRACT_ADDRESS=${address} to .env.local`)
  console.log(`  2. Add contract as Chainlink Functions consumer at https://functions.chain.link`)
  console.log(`  3. Fund admin wallet with USDC and call depositLiquidity()`)
}

main().catch((err) => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Compile everything**

```bash
cd contracts && pnpm compile
```

Expected: All contracts compile successfully.

- [ ] **Step 4: Export the ABI for the Next.js app**

After compile, the ABI is at `contracts/artifacts/contracts/BettingPlatform.sol/BettingPlatform.json`. Create `lib/contracts/abi.ts` in the root Next.js project:

```typescript
// lib/contracts/abi.ts
// Paste the `abi` array from contracts/artifacts/contracts/BettingPlatform.sol/BettingPlatform.json after compiling
export const BETTING_PLATFORM_ABI = [
  // --- Events ---
  { type: "event", name: "EventCreated", inputs: [
    { name: "eventId", type: "uint256", indexed: true },
    { name: "homeTeam", type: "string", indexed: false },
    { name: "awayTeam", type: "string", indexed: false },
  ]},
  { type: "event", name: "OddsUpdated", inputs: [
    { name: "eventId", type: "uint256", indexed: true },
    { name: "homeOdds", type: "uint256", indexed: false },
    { name: "awayOdds", type: "uint256", indexed: false },
  ]},
  { type: "event", name: "BetPlaced", inputs: [
    { name: "eventId", type: "uint256", indexed: true },
    { name: "bettor", type: "address", indexed: true },
    { name: "side", type: "uint8", indexed: false },
    { name: "amount", type: "uint256", indexed: false },
    { name: "oddsSnapshot", type: "uint256", indexed: false },
  ]},
  { type: "event", name: "SettlementRequested", inputs: [
    { name: "eventId", type: "uint256", indexed: true },
    { name: "requestId", type: "bytes32", indexed: false },
  ]},
  { type: "event", name: "EventSettled", inputs: [
    { name: "eventId", type: "uint256", indexed: true },
    { name: "result", type: "uint8", indexed: false },
  ]},
  // --- Read ---
  { type: "function", name: "usdc", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "nextEventId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "events", stateMutability: "view",
    inputs: [{ name: "eventId", type: "uint256" }],
    outputs: [{ type: "uint256", name: "id" }, { type: "string", name: "homeTeam" }, { type: "string", name: "awayTeam" },
              { type: "uint256", name: "homeOdds" }, { type: "uint256", name: "awayOdds" },
              { type: "uint256", name: "startTime" }, { type: "uint8", name: "status" }, { type: "string", name: "externalId" }]
  },
  { type: "function", name: "getBets", stateMutability: "view",
    inputs: [{ name: "eventId", type: "uint256" }],
    outputs: [{ type: "tuple[]", components: [
      { name: "bettor", type: "address" }, { name: "side", type: "uint8" },
      { name: "amount", type: "uint256" }, { name: "oddsSnapshot", type: "uint256" }, { name: "settled", type: "bool" }
    ]}]
  },
  // --- Write ---
  { type: "function", name: "depositLiquidity", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "createEvent", stateMutability: "nonpayable",
    inputs: [{ name: "homeTeam", type: "string" }, { name: "awayTeam", type: "string" },
             { name: "homeOdds", type: "uint256" }, { name: "awayOdds", type: "uint256" },
             { name: "startTime", type: "uint256" }, { name: "externalId", type: "string" }],
    outputs: [{ name: "eventId", type: "uint256" }]
  },
  { type: "function", name: "updateOdds", stateMutability: "nonpayable",
    inputs: [{ name: "eventId", type: "uint256" }, { name: "homeOdds", type: "uint256" }, { name: "awayOdds", type: "uint256" }],
    outputs: []
  },
  { type: "function", name: "placeBet", stateMutability: "nonpayable",
    inputs: [{ name: "eventId", type: "uint256" }, { name: "side", type: "uint8" }, { name: "amount", type: "uint256" }],
    outputs: []
  },
  { type: "function", name: "requestSettlement", stateMutability: "nonpayable",
    inputs: [{ name: "eventId", type: "uint256" }], outputs: []
  },
  { type: "function", name: "withdrawHouseFunds", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const
```

- [ ] **Step 5: Commit**

```bash
git add contracts/functions-source.js contracts/scripts/deploy.ts lib/contracts/abi.ts
git commit -m "feat: add Chainlink Functions source, deploy script, and ABI"
```

---

## Phase 2: Database Layer

### Task 8: Neon + Drizzle setup and schema

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/index.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Install root dependencies**

```bash
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit
```

Expected: Packages added to root `package.json`.

- [ ] **Step 2: Write drizzle.config.ts**

```typescript
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

- [ ] **Step 3: Write lib/db/schema.ts**

```typescript
import {
  pgTable,
  pgEnum,
  text,
  integer,
  uuid,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core"

export const eventStatusEnum = pgEnum("event_status", [
  "upcoming", "live", "completed", "cancelled",
])

export const resultEnum = pgEnum("result", [
  "home_win", "away_win", "draw", "pending",
])

export const betSideEnum = pgEnum("bet_side", ["home", "away"])

export const betStatusEnum = pgEnum("bet_status", [
  "pending", "won", "lost", "refunded",
])

export const leagues = pgTable("leagues", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  sport: text("sport").notNull(),
  external_id: text("external_id").notNull().unique(),
})

export const sports_events = pgTable("sports_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  external_id: text("external_id").notNull().unique(),
  on_chain_event_id: text("on_chain_event_id"),
  league_id: integer("league_id")
    .notNull()
    .references(() => leagues.id),
  home_team: text("home_team").notNull(),
  away_team: text("away_team").notNull(),
  match_time: timestamp("match_time", { withTimezone: true }).notNull(),
  status: eventStatusEnum("status").notNull().default("upcoming"),
  home_odds: numeric("home_odds", { precision: 8, scale: 4 }),
  away_odds: numeric("away_odds", { precision: 8, scale: 4 }),
  result: resultEnum("result").notNull().default("pending"),
})

export const users = pgTable("users", {
  wallet_address: text("wallet_address").primaryKey(),
  preferred_timezone: text("preferred_timezone").notNull().default("UTC"),
  favorite_sports: text("favorite_sports").array().notNull().default([]),
  top_leagues: integer("top_leagues").array().notNull().default([]),
})

export const bet_cache = pgTable("bet_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  tx_hash: text("tx_hash").notNull(),
  wallet_address: text("wallet_address")
    .notNull()
    .references(() => users.wallet_address),
  event_id: uuid("event_id")
    .notNull()
    .references(() => sports_events.id),
  side: betSideEnum("side").notNull(),
  amount_usdc: numeric("amount_usdc", { precision: 20, scale: 6 }).notNull(),
  odds_snapshot: numeric("odds_snapshot", { precision: 8, scale: 4 }).notNull(),
  status: betStatusEnum("status").notNull().default("pending"),
})
```

- [ ] **Step 4: Write lib/db/index.ts**

```typescript
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
```

- [ ] **Step 5: Add migrate and generate scripts to root package.json**

Open `package.json` and add to `"scripts"`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:push": "drizzle-kit push"
```

- [ ] **Step 6: Create .env.local with required variables**

```bash
cat > .env.local << 'EOF'
# Fill these in before running
DATABASE_URL=
NEXTAUTH_SECRET=
CRON_SECRET=
ADMIN_PRIVATE_KEY=
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_CONTRACT_ADDRESS=
NEXT_PUBLIC_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
CHAINLINK_SUBSCRIPTION_ID=
THESPORTSDB_API_KEY=3
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
EOF
```

- [ ] **Step 7: Add .env.local to .gitignore**

```bash
echo ".env.local" >> .gitignore
```

- [ ] **Step 8: Commit**

```bash
git add lib/db/ drizzle.config.ts .gitignore package.json
git commit -m "feat: add Drizzle ORM schema and Neon client"
```

---

### Task 9: Run migrations and seed EPL league

**Files:**
- Create: `lib/db/seed.ts`

- [ ] **Step 1: Set DATABASE_URL in .env.local**

Create a Neon project at https://neon.tech, copy the connection string, and set it in `.env.local`:
```
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
```

- [ ] **Step 2: Generate and push schema**

```bash
pnpm db:push
```

Expected: Drizzle connects to Neon and creates all tables. Output includes table names: `leagues`, `sports_events`, `users`, `bet_cache`.

- [ ] **Step 3: Write seed script**

```typescript
// lib/db/seed.ts
import { db } from "./index"
import { leagues } from "./schema"

async function seed() {
  await db.insert(leagues).values({
    name: "English Premier League",
    sport: "soccer",
    external_id: "4328",
  }).onConflictDoNothing()
  console.log("Seeded EPL league")
  process.exit(0)
}

seed().catch((err) => { console.error(err); process.exit(1) })
```

- [ ] **Step 4: Add seed script to package.json**

```json
"db:seed": "tsx lib/db/seed.ts"
```

Install tsx:
```bash
pnpm add -D tsx
```

- [ ] **Step 5: Run seed**

```bash
pnpm db:seed
```

Expected: `Seeded EPL league`

- [ ] **Step 6: Commit**

```bash
git add lib/db/seed.ts package.json
git commit -m "feat: add DB seed with EPL league"
```

---

## Phase 3: Auth and APIs

### Task 10: Auth.js v5 with SIWE credentials provider

**Files:**
- Create: `auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `middleware.ts`

- [ ] **Step 1: Install auth dependencies**

```bash
pnpm add next-auth@beta siwe
```

- [ ] **Step 2: Write auth.ts**

```typescript
// auth.ts
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
```

- [ ] **Step 3: Write app/api/auth/[...nextauth]/route.ts**

```typescript
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

- [ ] **Step 4: Write middleware.ts to protect /bets**

```typescript
// middleware.ts
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname.startsWith("/bets")) {
    return NextResponse.redirect(new URL("/", req.url))
  }
})

export const config = { matcher: ["/bets/:path*"] }
```

- [ ] **Step 5: Set NEXTAUTH_SECRET in .env.local**

```bash
openssl rand -base64 32
```

Copy output → set `NEXTAUTH_SECRET=<output>` in `.env.local`.

- [ ] **Step 6: Start dev server and verify the auth endpoint responds**

```bash
pnpm dev
```

Then in another terminal:
```bash
curl http://localhost:3000/api/auth/providers
```

Expected: JSON with a `credentials` provider entry.

- [ ] **Step 7: Commit**

```bash
git add auth.ts app/api/auth/ middleware.ts
git commit -m "feat: SIWE auth with Auth.js v5 credentials provider"
```

---

### Task 11: Events API

**Files:**
- Create: `app/api/events/route.ts`

- [ ] **Step 1: Write app/api/events/route.ts**

Returns all non-cancelled events ordered by match time.

```typescript
import { db } from "@/lib/db"
import { sports_events, leagues } from "@/lib/db/schema"
import { ne, asc, eq } from "drizzle-orm"

export async function GET() {
  const events = await db
    .select({
      id: sports_events.id,
      externalId: sports_events.external_id,
      onChainEventId: sports_events.on_chain_event_id,
      homeTeam: sports_events.home_team,
      awayTeam: sports_events.away_team,
      matchTime: sports_events.match_time,
      status: sports_events.status,
      homeOdds: sports_events.home_odds,
      awayOdds: sports_events.away_odds,
      result: sports_events.result,
      league: leagues.name,
      sport: leagues.sport,
    })
    .from(sports_events)
    .innerJoin(leagues, eq(leagues.id, sports_events.league_id))
    .where(ne(sports_events.status, "cancelled"))
    .orderBy(asc(sports_events.match_time))

  return Response.json(events)
}
```

- [ ] **Step 2: Test the endpoint**

With the dev server running:
```bash
curl http://localhost:3000/api/events
```

Expected: `[]` (no events yet — that's correct).

- [ ] **Step 3: Commit**

```bash
git add app/api/events/
git commit -m "feat: add GET /api/events endpoint"
```

---

### Task 12: User preferences API

**Files:**
- Create: `app/api/preferences/route.ts`

- [ ] **Step 1: Write app/api/preferences/route.ts**

```typescript
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  const session = await auth()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.wallet_address, session.user.address))

  if (!user) return new Response("Not found", { status: 404 })
  return Response.json(user)
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const body = await request.json()
  const { preferred_timezone, favorite_sports, top_leagues } = body

  await db
    .update(users)
    .set({
      ...(preferred_timezone !== undefined && { preferred_timezone }),
      ...(favorite_sports !== undefined && { favorite_sports }),
      ...(top_leagues !== undefined && { top_leagues }),
    })
    .where(eq(users.wallet_address, session.user.address))

  return new Response(null, { status: 204 })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/preferences/
git commit -m "feat: add GET/PUT /api/preferences endpoint"
```

---

## Phase 4: Worker Jobs

### Task 13: sync-events cron worker

**Files:**
- Create: `lib/contracts/client.ts`
- Create: `app/api/cron/sync-events/route.ts`

- [ ] **Step 1: Write lib/contracts/client.ts (server-only)**

```typescript
// lib/contracts/client.ts
// SERVER-ONLY — never import in client components
import { createWalletClient, createPublicClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { baseSepolia } from "viem/chains"
import { BETTING_PLATFORM_ABI } from "./abi"

const account = privateKeyToAccount(
  `0x${process.env.ADMIN_PRIVATE_KEY!.replace(/^0x/, "")}`
)

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL),
})

export const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL),
})

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`

export async function createEventOnChain(args: {
  homeTeam: string
  awayTeam: string
  homeOdds: bigint
  awayOdds: bigint
  startTime: bigint
  externalId: string
}): Promise<bigint> {
  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: BETTING_PLATFORM_ABI,
    functionName: "createEvent",
    args: [args.homeTeam, args.awayTeam, args.homeOdds, args.awayOdds, args.startTime, args.externalId],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const log = receipt.logs
    .map((l) => {
      try {
        return { ...l, parsed: publicClient.decodeEventLog({ abi: BETTING_PLATFORM_ABI, ...l }) }
      } catch { return null }
    })
    .find((l) => l?.parsed?.eventName === "EventCreated")
  if (!log?.parsed) throw new Error("EventCreated log not found")
  return (log.parsed.args as { eventId: bigint }).eventId
}

export async function updateOddsOnChain(eventId: bigint, homeOdds: bigint, awayOdds: bigint) {
  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: BETTING_PLATFORM_ABI,
    functionName: "updateOdds",
    args: [eventId, homeOdds, awayOdds],
  })
  await publicClient.waitForTransactionReceipt({ hash })
}

export async function requestSettlementOnChain(eventId: bigint) {
  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: BETTING_PLATFORM_ABI,
    functionName: "requestSettlement",
    args: [eventId],
  })
  await publicClient.waitForTransactionReceipt({ hash })
}
```

- [ ] **Step 2: Write app/api/cron/sync-events/route.ts**

```typescript
import { db } from "@/lib/db"
import { sports_events, leagues } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { createEventOnChain, updateOddsOnChain } from "@/lib/contracts/client"

function verifyCronSecret(request: Request) {
  const auth = request.headers.get("authorization")
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

interface SportsDBEvent {
  idEvent: string
  strHomeTeam: string
  strAwayTeam: string
  dateEvent: string
  strTime: string
  intHomeScore: string | null
  intAwayScore: string | null
  strStatus: string
  intEventFBHome?: string
  intEventFBAway?: string
}

function decimalOddsToBasePts(odds: string | undefined): bigint | null {
  if (!odds) return null
  const n = parseFloat(odds)
  if (isNaN(n) || n <= 0) return null
  return BigInt(Math.round(n * 10000))
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request)) {
    return new Response("Unauthorized", { status: 401 })
  }

  const apiKey = process.env.THESPORTSDB_API_KEY ?? "3"
  const EPL_ID = "4328"

  const res = await fetch(
    `https://www.thesportsdb.com/api/v1/json/${apiKey}/eventsnextleague.php?id=${EPL_ID}`
  )
  const data = await res.json()
  const rawEvents: SportsDBEvent[] = data.events ?? []

  // Find EPL league row
  const [epl] = await db.select().from(leagues).where(eq(leagues.external_id, EPL_ID))
  if (!epl) return new Response("EPL league not seeded", { status: 500 })

  let created = 0, updated = 0

  for (const raw of rawEvents) {
    const matchTime = new Date(`${raw.dateEvent}T${raw.strTime ?? "00:00:00"}Z`)
    const homeOdds = decimalOddsToBasePts(raw.intEventFBHome?.toString())
    const awayOdds = decimalOddsToBasePts(raw.intEventFBAway?.toString())

    // Upsert into DB
    const [existing] = await db
      .select()
      .from(sports_events)
      .where(eq(sports_events.external_id, raw.idEvent))

    if (!existing) {
      // Create in DB first
      const [inserted] = await db
        .insert(sports_events)
        .values({
          external_id: raw.idEvent,
          league_id: epl.id,
          home_team: raw.strHomeTeam,
          away_team: raw.strAwayTeam,
          match_time: matchTime,
          home_odds: homeOdds?.toString(),
          away_odds: awayOdds?.toString(),
        })
        .returning()

      // Register on-chain if contract is configured
      if (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
        try {
          const onChainId = await createEventOnChain({
            homeTeam: raw.strHomeTeam,
            awayTeam: raw.strAwayTeam,
            homeOdds: homeOdds ?? 0n,
            awayOdds: awayOdds ?? 0n,
            startTime: BigInt(Math.floor(matchTime.getTime() / 1000)),
            externalId: raw.idEvent,
          })
          await db
            .update(sports_events)
            .set({ on_chain_event_id: onChainId.toString() })
            .where(eq(sports_events.id, inserted.id))
        } catch (err) {
          console.error(`Failed to register event ${raw.idEvent} on-chain:`, err)
        }
      }
      created++
    } else if (homeOdds && awayOdds && existing.on_chain_event_id) {
      // Update odds if changed
      await db
        .update(sports_events)
        .set({ home_odds: homeOdds.toString(), away_odds: awayOdds.toString() })
        .where(eq(sports_events.external_id, raw.idEvent))
      try {
        await updateOddsOnChain(BigInt(existing.on_chain_event_id), homeOdds, awayOdds)
      } catch (err) {
        console.error(`Failed to update odds for event ${raw.idEvent}:`, err)
      }
      updated++
    }
  }

  return Response.json({ created, updated, total: rawEvents.length })
}
```

- [ ] **Step 3: Test the cron endpoint locally**

With the dev server running, set `CRON_SECRET=test` in `.env.local` and run:

```bash
curl -X POST http://localhost:3000/api/cron/sync-events \
  -H "Authorization: Bearer test"
```

Expected: `{"created":0,"updated":0,"total":0}` or with counts if TheSportsDB returns fixtures. No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/contracts/client.ts app/api/cron/sync-events/
git commit -m "feat: sync-events cron worker — fetch EPL fixtures and register on-chain"
```

---

### Task 14: check-results cron worker

**Files:**
- Create: `app/api/cron/check-results/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Write app/api/cron/check-results/route.ts**

```typescript
import { db } from "@/lib/db"
import { sports_events, bet_cache } from "@/lib/db/schema"
import { eq, inArray, lt, or } from "drizzle-orm"
import { requestSettlementOnChain, publicClient, CONTRACT_ADDRESS } from "@/lib/contracts/client"
import { BETTING_PLATFORM_ABI } from "@/lib/contracts/abi"

function verifyCronSecret(request: Request) {
  return request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
}

interface SportsDBEvent {
  idEvent: string
  strStatus: string
  intHomeScore: string | null
  intAwayScore: string | null
}

function toResult(homeScore: number, awayScore: number): "home_win" | "away_win" | "draw" {
  if (homeScore > awayScore) return "home_win"
  if (awayScore > homeScore) return "away_win"
  return "draw"
}

export async function POST(request: Request) {
  if (!verifyCronSecret(request)) {
    return new Response("Unauthorized", { status: 401 })
  }

  const apiKey = process.env.THESPORTSDB_API_KEY ?? "3"
  const now = new Date()

  // 1. Find events that may have finished (match_time passed, not yet completed)
  const pending = await db
    .select()
    .from(sports_events)
    .where(
      or(
        eq(sports_events.status, "upcoming"),
        eq(sports_events.status, "live")
      )
    )

  const maybeDone = pending.filter((e) => e.match_time < now)
  let settled = 0

  for (const event of maybeDone) {
    // 2. Fetch result from TheSportsDB
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/${apiKey}/lookupevent.php?id=${event.external_id}`
    )
    const data = await res.json()
    const raw: SportsDBEvent | undefined = data.events?.[0]

    if (!raw || raw.strStatus !== "Match Finished") {
      // Mark as live if not finished
      if (event.status === "upcoming") {
        await db
          .update(sports_events)
          .set({ status: "live" })
          .where(eq(sports_events.id, event.id))
      }
      continue
    }

    const homeScore = parseInt(raw.intHomeScore ?? "0")
    const awayScore = parseInt(raw.intAwayScore ?? "0")
    const result = toResult(homeScore, awayScore)

    // 3. Update DB
    await db
      .update(sports_events)
      .set({ status: "completed", result })
      .where(eq(sports_events.id, event.id))

    // 4. Request on-chain settlement
    if (event.on_chain_event_id) {
      try {
        await requestSettlementOnChain(BigInt(event.on_chain_event_id))
      } catch (err) {
        console.error(`Settlement request failed for event ${event.external_id}:`, err)
      }
    }
    settled++
  }

  // 5. Poll for EventSettled logs and update bet_cache
  if (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
    const blockNumber = await publicClient.getBlockNumber()
    const fromBlock = blockNumber - 1000n > 0n ? blockNumber - 1000n : 0n

    const settledLogs = await publicClient.getLogs({
      address: CONTRACT_ADDRESS,
      event: BETTING_PLATFORM_ABI.find((x) => "name" in x && x.name === "EventSettled") as any,
      fromBlock,
      toBlock: blockNumber,
    })

    for (const log of settledLogs) {
      const { eventId, result: rawResult } = log.args as { eventId: bigint; result: number }
      const resultMap: Record<number, "home_win" | "away_win" | "draw"> = {
        0: "home_win", 1: "away_win", 2: "draw",
      }
      const resolvedResult = resultMap[rawResult]
      if (!resolvedResult) continue

      // Find matching DB event
      const [evt] = await db
        .select()
        .from(sports_events)
        .where(eq(sports_events.on_chain_event_id, eventId.toString()))
      if (!evt) continue

      // Update bet_cache rows
      const bets = await db
        .select()
        .from(bet_cache)
        .where(eq(bet_cache.event_id, evt.id))

      for (const bet of bets) {
        if (bet.status !== "pending") continue
        let newStatus: "won" | "lost" | "refunded"
        if (resolvedResult === "draw") {
          newStatus = "refunded"
        } else {
          const betWon =
            (resolvedResult === "home_win" && bet.side === "home") ||
            (resolvedResult === "away_win" && bet.side === "away")
          newStatus = betWon ? "won" : "lost"
        }
        await db
          .update(bet_cache)
          .set({ status: newStatus })
          .where(eq(bet_cache.id, bet.id))
      }
    }
  }

  return Response.json({ settled })
}
```

- [ ] **Step 2: Write vercel.json**

```json
{
  "crons": [
    { "path": "/api/cron/sync-events",   "schedule": "0 * * * *" },
    { "path": "/api/cron/check-results", "schedule": "*/5 * * * *" }
  ]
}
```

- [ ] **Step 3: Test the endpoint**

```bash
curl -X POST http://localhost:3000/api/cron/check-results \
  -H "Authorization: Bearer test"
```

Expected: `{"settled":0}` — no events to process yet.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/check-results/ vercel.json
git commit -m "feat: check-results cron — poll TheSportsDB and trigger Chainlink settlement"
```

---

## Phase 5: Frontend

### Task 15: wagmi, RainbowKit, and Providers

**Files:**
- Create: `lib/wagmi/config.ts`
- Create: `components/Providers.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Install frontend web3 dependencies**

```bash
pnpm add @rainbow-me/rainbowkit wagmi viem @tanstack/react-query
pnpm add -D @types/node
```

- [ ] **Step 2: Write lib/wagmi/config.ts**

```typescript
import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { baseSepolia } from "wagmi/chains"

export const wagmiConfig = getDefaultConfig({
  appName: "BetChain",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "placeholder",
  chains: [baseSepolia],
  ssr: true,
})
```

- [ ] **Step 3: Write components/Providers.tsx**

```typescript
"use client"

import { RainbowKitProvider, darkTheme, createAuthenticationAdapter, RainbowKitAuthenticationProvider, AuthenticationStatus } from "@rainbow-me/rainbowkit"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SessionProvider } from "next-auth/react"
import { useCallback, useRef, useState } from "react"
import { SiweMessage } from "siwe"
import { signIn, signOut, getCsrfToken } from "next-auth/react"
import { wagmiConfig } from "@/lib/wagmi/config"

import "@rainbow-me/rainbowkit/styles.css"

const queryClient = new QueryClient()

export function Providers({ children, session }: { children: React.ReactNode; session: any }) {
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

    getMessageBody: ({ message }) => message.prepareMessage(),

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
```

- [ ] **Step 4: Update app/layout.tsx**

```typescript
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
```

- [ ] **Step 5: Verify dev server starts without errors**

```bash
pnpm dev
```

Open http://localhost:3000. Expected: page renders without console errors. (It will still show the old content — we replace it next.)

- [ ] **Step 6: Commit**

```bash
git add lib/wagmi/ components/Providers.tsx app/layout.tsx
git commit -m "feat: wagmi + RainbowKit + Auth.js providers"
```

---

### Task 16: NavBar

**Files:**
- Create: `components/NavBar.tsx`

- [ ] **Step 1: Write components/NavBar.tsx**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add components/NavBar.tsx
git commit -m "feat: NavBar with RainbowKit connect button"
```

---

### Task 17: Events feed page

**Files:**
- Create: `components/EventCard.tsx`
- Create: `components/EventsList.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write components/EventCard.tsx**

```typescript
"use client"

import { useState } from "react"

export interface Event {
  id: string
  onChainEventId: string | null
  homeTeam: string
  awayTeam: string
  matchTime: string
  status: string
  homeOdds: string | null
  awayOdds: string | null
  result: string
  league: string
}

interface EventCardProps {
  event: Event
  onBet: (event: Event) => void
  userTimezone?: string
}

export function EventCard({ event, onBet, userTimezone = "UTC" }: EventCardProps) {
  const isOpen = event.status === "upcoming" && event.onChainEventId
  const isLive = event.status === "live"

  const matchDate = new Date(event.matchTime)
  const formatted = matchDate.toLocaleString("en-GB", {
    timeZone: userTimezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div
      className={`bg-zinc-900 border rounded-xl p-4 flex items-center gap-4 transition-colors ${
        isOpen
          ? "border-zinc-700 hover:border-blue-500 cursor-pointer"
          : "border-zinc-800 opacity-60"
      }`}
      onClick={() => isOpen && onBet(event)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          {isLive && (
            <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-semibold">
              ● LIVE
            </span>
          )}
          <span className="text-xs text-zinc-500">{formatted}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-white text-sm truncate">{event.homeTeam}</span>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded shrink-0">
            {isLive ? "LIVE" : "vs"}
          </span>
          <span className="font-semibold text-white text-sm truncate">{event.awayTeam}</span>
        </div>
      </div>

      {isOpen && event.homeOdds && event.awayOdds ? (
        <div className="flex gap-2 shrink-0">
          <div className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-center min-w-[68px]">
            <div className="text-[10px] text-zinc-500 uppercase mb-1 truncate max-w-[60px]">
              {event.homeTeam.split(" ").pop()}
            </div>
            <div className="text-base font-bold text-green-400">
              {parseFloat(event.homeOdds).toFixed(2)}×
            </div>
          </div>
          <div className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-center min-w-[68px]">
            <div className="text-[10px] text-zinc-500 uppercase mb-1 truncate max-w-[60px]">
              {event.awayTeam.split(" ").pop()}
            </div>
            <div className="text-base font-bold text-amber-400">
              {parseFloat(event.awayOdds).toFixed(2)}×
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-600 shrink-0">
          {isLive ? "Awaiting result" : "Odds unavailable"}
        </div>
      )}

      {isOpen && <div className="text-zinc-600 text-lg shrink-0">›</div>}
    </div>
  )
}
```

- [ ] **Step 2: Write components/EventsList.tsx**

```typescript
"use client"

import { useState } from "react"
import { EventCard, Event } from "./EventCard"
import { BetModal } from "./BetModal"

interface EventsListProps {
  events: Event[]
  userTimezone?: string
}

export function EventsList({ events, userTimezone }: EventsListProps) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)

  if (events.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600">
        No upcoming matches available.
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {events.map((e) => (
          <EventCard key={e.id} event={e} onBet={setSelectedEvent} userTimezone={userTimezone} />
        ))}
      </div>
      {selectedEvent && (
        <BetModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </>
  )
}
```

- [ ] **Step 3: Replace app/page.tsx**

```typescript
import { NavBar } from "@/components/NavBar"
import { EventsList } from "@/components/EventsList"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { sports_events, leagues, users } from "@/lib/db/schema"
import { eq, ne, asc } from "drizzle-orm"

export default async function Home() {
  const session = await auth()

  const events = await db
    .select({
      id: sports_events.id,
      externalId: sports_events.external_id,
      onChainEventId: sports_events.on_chain_event_id,
      homeTeam: sports_events.home_team,
      awayTeam: sports_events.away_team,
      matchTime: sports_events.match_time,
      status: sports_events.status,
      homeOdds: sports_events.home_odds,
      awayOdds: sports_events.away_odds,
      result: sports_events.result,
      league: leagues.name,
      sport: leagues.sport,
    })
    .from(sports_events)
    .innerJoin(leagues, eq(leagues.id, sports_events.league_id))
    .where(ne(sports_events.status, "cancelled"))
    .orderBy(asc(sports_events.match_time))

  let userTimezone = "UTC"
  if (session?.user?.address) {
    const [user] = await db
      .select({ preferred_timezone: users.preferred_timezone })
      .from(users)
      .where(eq(users.wallet_address, session.user.address))
    if (user) userTimezone = user.preferred_timezone
  }

  const serialized = events.map((e) => ({
    ...e,
    matchTime: e.matchTime.toISOString(),
  }))

  return (
    <>
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-white">Active Matches</h1>
            <p className="text-sm text-zinc-500 mt-0.5">English Premier League</p>
          </div>
        </div>

        {!session ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">⚽</div>
            <h2 className="text-xl font-bold text-white mb-2">Connect your wallet to bet</h2>
            <p className="text-zinc-500 text-sm max-w-xs mx-auto">
              Sign in with Ethereum to view and place bets on EPL matches.
            </p>
          </div>
        ) : (
          <EventsList events={serialized} userTimezone={userTimezone} />
        )}
      </main>
    </>
  )
}
```

- [ ] **Step 4: Verify in browser**

```bash
pnpm dev
```

Open http://localhost:3000. Expected: NavBar with Connect button, prompt to connect wallet when unauthenticated.

- [ ] **Step 5: Commit**

```bash
git add components/EventCard.tsx components/EventsList.tsx app/page.tsx
git commit -m "feat: events feed page with EventCard and EventsList"
```

---

### Task 18: Bet placement modal

**Files:**
- Create: `components/BetModal.tsx`

- [ ] **Step 1: Write components/BetModal.tsx**

```typescript
"use client"

import { useState } from "react"
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { parseUnits } from "viem"
import { BETTING_PLATFORM_ABI } from "@/lib/contracts/abi"
import type { Event } from "./EventCard"

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`

const USDC_ABI = [
  {
    type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const

const QUICK_PICKS = [10, 25, 50, 100]

interface BetModalProps {
  event: Event
  onClose: () => void
}

export function BetModal({ event, onClose }: BetModalProps) {
  const [side, setSide] = useState<0 | 1 | null>(null) // 0=home, 1=away
  const [amount, setAmount] = useState("")
  const [step, setStep] = useState<"pick" | "approving" | "betting" | "done">("pick")

  const { writeContract, data: approveTxHash } = useWriteContract()
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash })

  const { writeContract: writeBet, data: betTxHash } = useWriteContract()
  const { isSuccess: betSuccess } = useWaitForTransactionReceipt({ hash: betTxHash })

  const amountNum = parseFloat(amount) || 0
  const oddsNum = side === 0
    ? parseFloat(event.homeOdds ?? "0")
    : parseFloat(event.awayOdds ?? "0")
  const payout = (amountNum * oddsNum).toFixed(2)

  async function handleApprove() {
    if (side === null || amountNum <= 0) return
    setStep("approving")
    writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [CONTRACT_ADDRESS, parseUnits(amount, 6)],
    })
  }

  async function handleBet() {
    if (side === null || !event.onChainEventId) return
    setStep("betting")
    writeBet({
      address: CONTRACT_ADDRESS,
      abi: BETTING_PLATFORM_ABI,
      functionName: "placeBet",
      args: [BigInt(event.onChainEventId), side, parseUnits(amount, 6)],
    })
  }

  if (betSuccess) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm text-center">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="text-lg font-bold text-white mb-2">Bet placed!</h3>
          <p className="text-zinc-400 text-sm mb-6">
            {amountNum} USDC on {side === 0 ? event.homeTeam : event.awayTeam}
          </p>
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-zinc-500 mb-1">{event.league}</p>
            <h3 className="font-bold text-white text-base">{event.homeTeam} vs {event.awayTeam}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Pick side */}
        <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Pick a side</p>
        <div className="flex gap-2 mb-5">
          {([0, 1] as const).map((s) => {
            const team = s === 0 ? event.homeTeam : event.awayTeam
            const odds = s === 0 ? event.homeOdds : event.awayOdds
            const selected = side === s
            return (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`flex-1 rounded-xl py-3 text-center border transition-colors ${
                  selected
                    ? "bg-blue-900 border-blue-500"
                    : "bg-zinc-950 border-zinc-700 hover:border-zinc-500"
                }`}
              >
                <div className={`text-xs font-semibold mb-1 ${selected ? "text-white" : "text-zinc-400"}`}>
                  {team}
                </div>
                <div className={`text-xl font-bold ${selected ? "text-blue-300" : "text-zinc-500"}`}>
                  {odds ? parseFloat(odds).toFixed(2) : "—"}×
                </div>
              </button>
            )
          })}
        </div>

        {/* Amount */}
        <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Bet amount (USDC)</p>
        <div className="bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 flex items-center justify-between mb-2">
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="bg-transparent text-xl font-bold text-white outline-none w-full"
          />
          <span className="text-zinc-500 text-sm ml-2 shrink-0">USDC</span>
        </div>
        <div className="flex gap-2 mb-5">
          {QUICK_PICKS.map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v.toString())}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg py-1.5 text-xs text-zinc-300"
            >
              {v}
            </button>
          ))}
        </div>

        {/* Summary */}
        {side !== null && amountNum > 0 && (
          <div className="bg-zinc-950 rounded-xl px-4 py-3 mb-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Potential payout</span>
              <span className="text-green-400 font-semibold">{payout} USDC</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Odds locked at</span>
              <span className="text-white">{oddsNum.toFixed(2)}×</span>
            </div>
          </div>
        )}

        {/* Action button */}
        {step === "pick" && (
          <button
            onClick={handleApprove}
            disabled={side === null || amountNum <= 0}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {approveSuccess ? "Approved — Place Bet" : "Approve USDC"}
          </button>
        )}

        {step === "approving" && !approveSuccess && (
          <button disabled className="w-full bg-zinc-700 text-zinc-400 font-semibold py-3 rounded-xl">
            Approving…
          </button>
        )}

        {(step === "approving" && approveSuccess) && (
          <button
            onClick={handleBet}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl"
          >
            Place Bet
          </button>
        )}

        {step === "betting" && (
          <button disabled className="w-full bg-zinc-700 text-zinc-400 font-semibold py-3 rounded-xl">
            Placing bet…
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

With the dev server running and a wallet connected (and some events in the DB from a cron run), click an event card. Expected: modal opens with team/odds selection, amount input, payout preview.

- [ ] **Step 3: Commit**

```bash
git add components/BetModal.tsx
git commit -m "feat: bet placement modal with two-step USDC approve + placeBet"
```

---

### Task 19: My Bets page

**Files:**
- Create: `components/BetList.tsx`
- Create: `app/bets/page.tsx`

- [ ] **Step 1: Write components/BetList.tsx**

```typescript
"use client"

interface Bet {
  id: string
  homeTeam: string
  awayTeam: string
  side: string
  amountUsdc: string
  oddsSnapshot: string
  status: string
  matchTime: string
}

const statusStyles: Record<string, string> = {
  pending: "bg-zinc-700 text-zinc-300",
  won:     "bg-green-900 text-green-300",
  lost:    "bg-red-900 text-red-300",
  refunded:"bg-zinc-700 text-zinc-400",
}

export function BetList({ bets }: { bets: Bet[] }) {
  if (bets.length === 0) {
    return <p className="text-zinc-600 text-sm text-center py-16">You haven't placed any bets yet.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {bets.map((bet) => {
        const payout = (parseFloat(bet.amountUsdc) * parseFloat(bet.oddsSnapshot)).toFixed(2)
        return (
          <div key={bet.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white">
                {bet.homeTeam} vs {bet.awayTeam}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusStyles[bet.status] ?? statusStyles.pending}`}>
                {bet.status}
              </span>
            </div>
            <div className="text-xs text-zinc-500 space-y-0.5">
              <div>Picked: <span className="text-zinc-300">{bet.side === "home" ? bet.homeTeam : bet.awayTeam}</span></div>
              <div>Stake: <span className="text-zinc-300">{parseFloat(bet.amountUsdc).toFixed(2)} USDC</span> @ <span className="text-zinc-300">{parseFloat(bet.oddsSnapshot).toFixed(2)}×</span></div>
              {bet.status === "won" && (
                <div>Payout: <span className="text-green-400 font-medium">{payout} USDC</span></div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Write app/bets/page.tsx**

```typescript
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { bet_cache, sports_events } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NavBar } from "@/components/NavBar"
import { BetList } from "@/components/BetList"

export default async function BetsPage() {
  const session = await auth()
  if (!session) redirect("/")

  const bets = await db
    .select({
      id: bet_cache.id,
      homeTeam: sports_events.home_team,
      awayTeam: sports_events.away_team,
      side: bet_cache.side,
      amountUsdc: bet_cache.amount_usdc,
      oddsSnapshot: bet_cache.odds_snapshot,
      status: bet_cache.status,
      matchTime: sports_events.match_time,
    })
    .from(bet_cache)
    .innerJoin(sports_events, eq(sports_events.id, bet_cache.event_id))
    .where(eq(bet_cache.wallet_address, session.user.address))
    .orderBy(sports_events.match_time)

  const serialized = bets.map((b) => ({
    ...b,
    matchTime: b.matchTime.toISOString(),
  }))

  return (
    <>
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-lg font-semibold text-white mb-6">My Bets</h1>
        <BetList bets={serialized} />
      </main>
    </>
  )
}
```

- [ ] **Step 3: Verify in browser**

Navigate to http://localhost:3000/bets while signed in. Expected: "You haven't placed any bets yet." (or bet rows if any exist).

- [ ] **Step 4: Commit**

```bash
git add components/BetList.tsx app/bets/
git commit -m "feat: My Bets page with bet history"
```

---

## Post-Implementation Checklist

Before considering this complete, verify:

- [ ] `cd contracts && pnpm test` — all contract tests pass
- [ ] `pnpm dev` — dev server starts without TypeScript errors
- [ ] Connect wallet → SIWE sign-in works → session cookie set
- [ ] `curl -X POST http://localhost:3000/api/cron/sync-events -H "Authorization: Bearer $CRON_SECRET"` returns `{"created":N,"updated":M,"total":K}`
- [ ] Events appear in the feed after sync-events runs
- [ ] Click an event → BetModal opens, side selection and amount input work
- [ ] `/bets` page renders when authenticated, redirects when not

### Deploy to Vercel

1. Push to GitHub and connect repo to Vercel
2. Add all env vars from `.env.local` to Vercel project settings
3. Deploy — Vercel will detect `vercel.json` and configure cron jobs automatically
4. Run deploy script: `cd contracts && pnpm deploy:sepolia`
5. Add contract address to Vercel env vars
6. Add contract as Chainlink Functions consumer at https://functions.chain.link
