import { ethers } from "hardhat";

async function main() {
  console.log("Starting deployment of EthexLoto...");

  const dummyJackpot = "";
  const dummyHouse = "";
  const dummySuperprize = "";

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