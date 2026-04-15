
# EthexLoto Modernized - Technical Assessment

## Project Overview
This repository contains a modernized, secure, and gas-optimized refactor of the **Ethex Loto** smart contract. The project is a "provably fair" lottery system where players guess trailing hexadecimal characters of future Ethereum block hashes. 

The original legacy implementation (v0.5.10) was refactored to **Solidity v0.8.20** to meet modern safety standards and gas efficiency requirements.

---

## Architecture Decisions

### 1. Unified Storage Structs
In the legacy version, bet data was split across five different mappings (`blockNumberQueue`, `amountQueue`, etc.). 
* **Decision:** Consolidated all bet metadata into a single `Bet` struct mapped to a `uint256` index.
* **Why:** This reduces the number of `SSTORE` operations during the `placeBet` phase. Writing to one struct in one slot (or adjacent slots) is significantly cheaper than writing to five distinct storage locations.

### 2. Custom Errors over Require Strings
* **Decision:** Implemented `error InvalidAmount()`, `error TransferFailed()`, etc.
* **Why:** String revert messages (e.g., `require(condition, "Error message")`) take up significant space in the contract bytecode and increase gas costs for users when a transaction fails. Custom errors provide the same clarity for developers but are represented as 4-byte selectors, making the contract leaner.

### 3. Pointer-Based Queue Management
The contract uses a `first` and `last` pointer system to manage the lifecycle of bets. This ensures O(1) complexity for both placement and settlement, preventing gas exhaustion as the player base grows.

---

## Security Report

### 1. Fix: `.transfer()` to `.call()`
The legacy code used `.transfer()` which is limited to a 2300 gas stipend. This often causes failures when players use multi-sig wallets or smart contract accounts (Account Abstraction). I implemented the low-level `.call{value: amount}("")` pattern with a success check to ensure compatibility with modern wallet infrastructure.

### 2. Reentrancy Protection
I integrated OpenZeppelin’s `ReentrancyGuard`. Both `placeBet` and `settleBets` are marked `nonReentrant`. While the contract logic follows the Checks-Effects-Interactions pattern, this provides an extra layer of defense-in-depth against malicious callbacks.

### 3. Integer Safety
By moving to Solidity 0.8+, we benefit from native overflow/underflow checks. This allowed for the removal of the SafeMath library, further reducing the code footprint while maintaining mathematical integrity.

### 4. Same-Block Settlement Prevention
Added a check to ensure `settleBets` cannot process a bet within the same block it was placed. This mitigates risks related to flash-loan-assisted "atomic" betting or miner-level frontrunning within a single block.

---

## Setup & Testing

### Prerequisites
* [Node.js](https://nodejs.org/) (v16+ recommended)
* [Hardhat](https://hardhat.org/)

### Installation
```bash
npm install
```

### Running Tests
The test suite covers fee distribution, the 256-block expiry refund logic, and basic win/loss settlement.
```bash
npx hardhat test
```

### Deployment
To deploy to a local node or testnet (ensure your `hardhat.config.ts` is configured):
```bash
npx hardhat run scripts/deploy.ts --network <network-name>
```