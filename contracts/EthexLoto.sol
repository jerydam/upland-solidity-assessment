// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EthexLoto Modernized
 * @author Refactored for Technical Assessment
 * @notice A provably fair lottery using future block hashes.
 */
contract EthexLoto is Ownable, ReentrancyGuard {
    // --- Custom Errors ---
    error InvalidAmount();
    error InvalidID();
    error TransferFailed();
    error HoldConstraintViolated();
    error BalanceConstraintViolated();
    error PendingBetsExist();

    // --- Storage ---
    struct Bet {
        uint256 blockNumber;
        uint256 amount;
        bytes16 id;
        bytes6 betData;
        address payable gamer;
    }

    mapping(uint256 => Bet) public betQueue;
    uint256 public first = 2;
    uint256 public last = 1;
    uint256 public holdBalance;

    address payable public jackpotAddress;
    address payable public houseAddress;
    address payable public superprizeAddress;

    // --- Constants ---
    uint256 internal constant MIN_BET = 0.01 ether;
    uint256 internal constant PRECISION = 1e18;
    uint256 internal constant JACKPOT_PERCENT = 10;
    uint256 internal constant HOUSE_EDGE = 10;

    // --- Events ---
    event BetPlaced(bytes16 indexed id, address indexed gamer, uint256 amount);
    event BetSettled(bytes16 indexed id, address indexed gamer, uint256 payout);
    event BetRefunded(bytes16 indexed id, address indexed gamer, uint256 amount);

    constructor(
        address payable _jackpot, 
        address payable _house, 
        address payable _superprize
    ) Ownable(msg.sender) {
        jackpotAddress = _jackpot;
        houseAddress = _house;
        superprizeAddress = _superprize;
    }

    /**
     * @notice Places a bet by encoding the 16-byte ID and 6-byte guess into params.
     */
    function placeBet(bytes16 id, bytes6 betData) external payable nonReentrant {
        // Validation
        if (msg.sender != tx.origin) revert("EOA only"); 
        if (msg.value < MIN_BET) revert InvalidAmount();
        if (id == 0) revert InvalidID();

        // Calculate Fees
        uint256 jackpotFee = (msg.value * JACKPOT_PERCENT) / 100;
        uint256 houseEdgeFee = (msg.value * HOUSE_EDGE) / 100;
        uint256 betAmount = msg.value - jackpotFee - houseEdgeFee;

        // Calculate Multipliers and Hold requirements
        (uint256 coefficient, uint8 markedCount, uint256 holdAmount) = getHold(betAmount, betData);

        // Original Risk Management Constraints
        // 1. Ensure bet isn't too large relative to multipliers
        if (msg.value * (100 - JACKPOT_PERCENT - HOUSE_EDGE) * (coefficient * 8 - 15 * markedCount) > 9000 ether * markedCount) 
            revert HoldConstraintViolated();

        // 2. Ensure contract has enough liquidity
        uint256 contractBalance = address(this).balance - holdBalance;
        if (msg.value * (800 * coefficient - (JACKPOT_PERCENT + HOUSE_EDGE) * (coefficient * 8 + 15 * markedCount)) > 1500 * markedCount * contractBalance)
            revert BalanceConstraintViolated();

        // Lock funds for this bet
        holdBalance += holdAmount;

        // Enqueue
        last++;
        betQueue[last] = Bet({
            blockNumber: block.number,
            amount: betAmount,
            id: id,
            betData: betData,
            gamer: payable(msg.sender)
        });

        // External Fee Distribution (Simulated or Real)
        _sendEth(houseAddress, houseEdgeFee);
        _sendEth(jackpotAddress, jackpotFee);

        emit BetPlaced(id, msg.sender, msg.value);
    }

    /**
     * @notice Processes pending bets in the queue.
     */
    function settleBets(uint256 batchSize) external nonReentrant {
        uint256 processed = 0;
        uint256 currentFirst = first;
        uint256 currentLast = last;

        while (processed < batchSize && currentFirst <= currentLast) {
            Bet storage b = betQueue[currentFirst];
            
            // Cannot settle in the same block as placement
            if (b.blockNumber >= block.number) break;

            (uint256 coefficient, uint8 markedCount, uint256 holdAmount) = getHold(b.amount, b.betData);
            holdBalance -= holdAmount;

            if (block.number > b.blockNumber + 256) {
                // EVM limit reached: Refund base bet
                _sendEth(b.gamer, b.amount);
                emit BetRefunded(b.id, b.gamer, b.amount);
            } else {
                _processWinner(b, markedCount);
            }

            delete betQueue[currentFirst];
            currentFirst++;
            processed++;
        }
        
        // Reset pointers if queue cleared
        if (currentFirst > currentLast) {
            first = 2;
            last = 1;
        } else {
            first = currentFirst;
        }
    }

    function _processWinner(Bet storage b, uint8 markedCount) internal {
        bytes32 hash = blockhash(b.blockNumber); // Original logic uses placement block hash
        uint256 coefficient = 0;
        bool isSuperPrize = true;

        for (uint8 j = 0; j < 6; j++) {
            bytes1 choice = b.betData[j];
            if (choice > 0x13) {
                isSuperPrize = false;
                continue;
            }

            bytes1 target;
            if (j % 2 == 0) target = hash[29 + j / 2] >> 4;
            else target = hash[29 + j / 2] & 0x0F;

            if (choice < 0x10) { // Specific Symbol
                if (target == choice) coefficient += 30;
                else isSuperPrize = false;
            } else {
                isSuperPrize = false;
                if (choice == 0x10 && target > 0x09 && target < 0x10) coefficient += 5; // Letters
                else if (choice == 0x11 && target < 0x0A) coefficient += 3; // Numbers
                else if (choice == 0x12 && target < 0x0A && uint8(target) % 2 != 0) coefficient += 6; // Odd
                else if (choice == 0x13 && target < 0x0A && uint8(target) % 2 == 0) coefficient += 6; // Even
            }
        }

        uint256 payoutAmount = (b.amount * coefficient * 8) / (15 * markedCount);
        
        if (payoutAmount > 0) {
            _sendEth(b.gamer, payoutAmount);
            emit BetSettled(b.id, b.gamer, payoutAmount);
        }

        if (isSuperPrize) {
            // Handle Superprize logic via external call...
        }
    }

    /**
     * @notice Helper to calculate the required liquidity to hold for a specific bet.
     */
    function getHold(uint256 amount, bytes6 betData) public pure returns (uint256 coefficient, uint8 markedCount, uint256 holdAmount) {
        for (uint8 i = 0; i < 6; i++) {
            bytes1 b = betData[i];
            if (b > 0x13) continue;
            markedCount++;
            if (b < 0x10) coefficient += 30;
            else if (b == 0x10) coefficient += 5;
            else if (b == 0x11) coefficient += 3;
            else if (b >= 0x12) coefficient += 6;
        }
        if (markedCount > 0) {
            holdAmount = (amount * coefficient * 8) / (15 * markedCount);
        }
    }

    function _sendEth(address payable to, uint256 amount) internal {
        if (amount == 0) return;
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    // --- Admin Functions ---
    function setAddresses(address payable _j, address payable _h, address payable _s) external onlyOwner {
        jackpotAddress = _j;
        houseAddress = _h;
        superprizeAddress = _s;
    }

    receive() external payable {}
}