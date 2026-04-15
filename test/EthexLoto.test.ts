import { expect } from "chai";
import hre from "hardhat";
import { parseEther, getAddress, hexToBytes, toHex } from "viem";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";

describe("EthexLoto Modernized (Viem)", function () {
  async function deployLotoFixture() {
    const [owner, jackpot, house, superprize, player] = await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();

    const loto = await hre.viem.deployContract("EthexLoto", [
      getAddress(jackpot.account.address),
      getAddress(house.account.address),
      getAddress(superprize.account.address),
    ]);

    // Fund the contract
    await owner.sendTransaction({
      to: loto.address,
      value: parseEther("10"),
    });

    return { loto, owner, jackpot, house, player, publicClient };
  }

  describe("Bet Placement", function () {
    it("Should revert if bet is below minimum", async function () {
      const { loto, player } = await loadFixture(deployLotoFixture);
      const id = toHex("bet1", { size: 16 });
      const betData = "0x010203040506";

      await expect(
        loto.write.placeBet([id, betData], { 
          value: parseEther("0.005"),
          account: player.account 
        })
      ).to.be.rejectedWith("InvalidAmount");
    });

    it("Should correctly distribute fees", async function () {
      const { loto, house, jackpot, player, publicClient } = await loadFixture(deployLotoFixture);
      const id = toHex("bet2", { size: 16 });
      const betValue = parseEther("1");

      const houseInitial = await publicClient.getBalance({ address: house.account.address });
      
      await loto.write.placeBet([id, "0x010203040506"], { 
        value: betValue,
        account: player.account 
      });

      const houseFinal = await publicClient.getBalance({ address: house.account.address });
      // 10% Fee
      expect(houseFinal).to.equal(houseInitial + (betValue / 10n));
    });
  });

  describe("Settlement Logic", function () {
    it("Should refund player if more than 256 blocks passed", async function () {
      const { loto, player, publicClient } = await loadFixture(deployLotoFixture);
      const id = toHex("bet3", { size: 16 });
      const val = parseEther("0.1");

      await loto.write.placeBet([id, "0x010203040506"], { value: val, account: player.account });
      
      // Mine 257 blocks
      await mine(257);

      const balBefore = await publicClient.getBalance({ address: player.account.address });
      await loto.write.settleBets([1n]);
      const balAfter = await publicClient.getBalance({ address: player.account.address });

      expect(balAfter).to.be.greaterThan(balBefore);
    });
  });
});