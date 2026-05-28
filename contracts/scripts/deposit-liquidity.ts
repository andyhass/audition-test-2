// contracts/scripts/deposit-liquidity.ts
import hre from "hardhat";

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;

const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

const PLATFORM_ABI = ["function depositLiquidity(uint256 amount) external"];

// Amount to deposit — adjust as needed (default: 1000 USDC)
const DEPOSIT_AMOUNT_USDC = 5n * 10n ** 6n;

async function main() {
  if (!CONTRACT_ADDRESS)
    throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS not set in .env.local");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Admin wallet: ${deployer.address}`);

  const usdc = new hre.ethers.Contract(USDC_BASE_SEPOLIA, USDC_ABI, deployer);
  const platform = new hre.ethers.Contract(
    CONTRACT_ADDRESS,
    PLATFORM_ABI,
    deployer,
  );

  const balance = await usdc.balanceOf(deployer.address);
  console.log(`USDC balance: ${Number(balance) / 1e6} USDC`);

  if (balance < DEPOSIT_AMOUNT_USDC) {
    throw new Error(
      `Insufficient USDC. Have ${Number(balance) / 1e6}, need ${Number(DEPOSIT_AMOUNT_USDC) / 1e6}. ` +
        `Get testnet USDC at https://faucet.circle.com`,
    );
  }

  console.log(`Approving ${Number(DEPOSIT_AMOUNT_USDC) / 1e6} USDC...`);
  const approveTx = await usdc.approve(CONTRACT_ADDRESS, DEPOSIT_AMOUNT_USDC);
  await approveTx.wait();
  console.log("Approved.");

  console.log("Depositing liquidity...");
  const depositTx = await platform.depositLiquidity(DEPOSIT_AMOUNT_USDC);
  await depositTx.wait();
  console.log(
    `Deposited ${Number(DEPOSIT_AMOUNT_USDC) / 1e6} USDC into BettingPlatform.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
