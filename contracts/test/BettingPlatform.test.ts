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
})
