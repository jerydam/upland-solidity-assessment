import { ethers } from "hardhat";

async function main() {
  console.log("Starting deployment of EthexLoto...");

  // These would be the actual addresses on Scroll/Sepolia
  const dummyJackpot = "0x1234567890123456789012345678901234567890";
  const dummyHouse = "0x2345678901234567890123456789012345678901";
  const dummySuperprize = "0x3456789012345678901234567890123456789012";

  const EthexLoto = await ethers.getContractFactory("EthexLoto");
  const loto = await EthexLoto.deploy(dummyJackpot, dummyHouse, dummySuperprize);

  await loto.deployed();

  console.log(`EthexLoto deployed to: ${loto.address}`);
  console.log("Check verification on Etherscan/Blockscout shortly.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});