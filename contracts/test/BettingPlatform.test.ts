import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import hre from "hardhat"

describe("BettingPlatform", function () {
  async function deployFixture() {
    const [owner, bettor, other] = await hre.ethers.getSigners()

    const MockERC20 = await hre.ethers.getContractFactory("MockERC20")
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6)

    const BettingPlatform = await hre.ethers.getContractFactory("BettingPlatform")
    const platform = await BettingPlatform.deploy(await usdc.getAddress())

    return { platform, usdc, owner, bettor, other }
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
      await platform.connect(bettor).placeBet(0n, 0, 100n * 10n ** 6n)

      await usdc.mint(other.address, 500n * 10n ** 6n)
      await usdc.connect(other).approve(await platform.getAddress(), 500n * 10n ** 6n)
      await platform.connect(other).placeBet(0n, 1, 50n * 10n ** 6n)

      return { ...base, startTime }
    }

    it("pays home winner at snapshotted odds on home win", async function () {
      const { platform, usdc, bettor } = await loadFixture(withBetsFixture)
      const bettorBefore = await usdc.balanceOf(bettor.address)
      await platform.settle(0n, 0) // 0 = home win
      const bettorAfter = await usdc.balanceOf(bettor.address)
      expect(bettorAfter - bettorBefore).to.equal(180n * 10n ** 6n)
    })

    it("refunds both sides on draw", async function () {
      const { platform, usdc, bettor, other } = await loadFixture(withBetsFixture)
      const bettorBefore = await usdc.balanceOf(bettor.address)
      const otherBefore = await usdc.balanceOf(other.address)
      await platform.settle(0n, 2) // 2 = draw
      expect(await usdc.balanceOf(bettor.address) - bettorBefore).to.equal(100n * 10n ** 6n)
      expect(await usdc.balanceOf(other.address) - otherBefore).to.equal(50n * 10n ** 6n)
    })

    it("emits EventSettled", async function () {
      const { platform } = await loadFixture(withBetsFixture)
      await expect(platform.settle(0n, 1))
        .to.emit(platform, "EventSettled").withArgs(0n, 1)
    })

    it("reverts if already settled", async function () {
      const { platform } = await loadFixture(withBetsFixture)
      await platform.settle(0n, 0)
      await expect(platform.settle(0n, 0)).to.be.revertedWith("Already settled")
    })
  })
})
