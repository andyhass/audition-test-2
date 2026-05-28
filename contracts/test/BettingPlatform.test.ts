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
