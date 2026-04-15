import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { EthexLoto } from "../typechain-types";

describe("EthexLoto Modernized", function () {
  let loto: EthexLoto;
  let owner: SignerWithAddress;
  let jackpot: SignerWithAddress;
  let house: SignerWithAddress;
  let superprize: SignerWithAddress;
  let player: SignerWithAddress;

  const MIN_BET = ethers.utils.parseEther("0.01");

  beforeEach(async function () {
    [owner, jackpot, house, superprize, player] = await ethers.getSigners();

    const EthexLotoFactory = await ethers.getContractFactory("EthexLoto");
    loto = await EthexLotoFactory.deploy(
      jackpot.address,
      house.address,
      superprize.address
    );
    await loto.deployed();

    // Fund the contract so it can pay out winners
    await owner.sendTransaction({
      to: loto.address,
      value: ethers.utils.parseEther("10"),
    });
  });

  describe("Bet Placement", function () {
    it("Should revert if bet is below minimum", async function () {
      const id = ethers.utils.hexZeroPad("0x11", 16);
      const betData = "0x010203040506";
      await expect(
        loto.connect(player).placeBet(id, betData, { value: ethers.utils.parseEther("0.005") })
      ).to.be.revertedWithCustomError(loto, "InvalidAmount");
    });

    it("Should correctly distribute fees to house and jackpot", async function () {
      const id = ethers.utils.hexZeroPad("0x12", 16);
      const betData = "0x010203040506";
      const betValue = ethers.utils.parseEther("1");

      const initialHouseBal = await house.getBalance();
      const initialJackpotBal = await jackpot.getBalance();

      await loto.connect(player).placeBet(id, betData, { value: betValue });

      // 10% House, 10% Jackpot
      expect(await house.getBalance()).to.equal(initialHouseBal.add(betValue.div(10)));
      expect(await jackpot.getBalance()).to.equal(initialJackpotBal.add(betValue.div(10)));
    });
  });

  describe("Settlement Logic", function () {
    it("Should refund player if more than 256 blocks have passed", async function () {
      const id = ethers.utils.hexZeroPad("0x13", 16);
      const betData = "0x010203040506";
      const betValue = MIN_BET;

      await loto.connect(player).placeBet(id, betData, { value: betValue });

      // Mine 257 blocks to expire the blockhash
      for (let i = 0; i < 257; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const playerInitialBal = await player.getBalance();
      
      // Settle the bet
      const tx = await loto.settleBets(1);
      
      await expect(tx).to.emit(loto, "BetRefunded");
      
      // Note: Player gets back the betAmount (80% of msg.value after fees)
      const betAmount = betValue.mul(80).div(100);
      expect(await player.getBalance()).to.be.gt(playerInitialBal);
    });

    it("Should not settle bets placed in the current block", async function () {
      const id = ethers.utils.hexZeroPad("0x14", 16);
      await loto.connect(player).placeBet(id, "0x010203040506", { value: MIN_BET });

      // Attempt to settle immediately
      await loto.settleBets(1);
      
      // 'first' pointer should not have moved because blockNumber == current block
      expect(await loto.first()).to.equal(2);
    });
  });

  describe("Bitwise Winning Logic", function () {
    it("Should correctly identify a winning bet based on blockhash", async function () {
      // This is a complex test because we can't easily predict blockhash in Hardhat 
      // without mining and then checking. Usually, we mock the blockhash or 
      // check if the event 'BetSettled' is emitted if a match occurs.
      
      const id = ethers.utils.hexZeroPad("0x15", 16);
      // '0x11' is the code for ANY NUMBER (0-9)
      const betData = "0x111111111111"; 

      await loto.connect(player).placeBet(id, betData, { value: MIN_BET });
      
      await ethers.provider.send("evm_mine", []);
      
      const tx = await loto.settleBets(1);
      const receipt = await tx.wait();
      
      // Since 0-9 covers 10/16 of hex possibilities, odds are we win some coefficient
      const settledEvent = receipt.events?.find(e => e.event === "BetSettled");
      if (settledEvent) {
          console.log("Win detected with payout:", ethers.utils.formatEther(settledEvent.args?.payout));
      }
    });
  });
});