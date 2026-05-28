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
})
