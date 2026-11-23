// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice A simple native-ETH vault. Each beneficiary alone can withdraw their balance.
/// @dev No owner, upgrade mechanism, arbitrary external calls, or administrative withdrawal.
contract SepoliaStore {
    struct Record {
        uint256 amount;
        address actor;
        uint64 timestamp;
        uint64 blockNumber;
        uint8 kind; // 0: deposit, 1: withdrawal
    }
    mapping(address => uint256) public balanceOf;
    mapping(address => Record[]) private records;
    uint256 public totalStored;
    bool private entered;

    event Stored(address indexed payer, address indexed beneficiary, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);
    error InvalidAddress();
    error InvalidAmount();
    error InsufficientBalance();
    error ReentrantCall();
    error PaymentFailed();
    error UseStoreFunction();

    modifier nonReentrant() {
        if (entered) revert ReentrantCall();
        entered = true;
        _;
        entered = false;
    }

    function store(address beneficiary) external payable nonReentrant {
        if (beneficiary == address(0) || beneficiary == address(this)) revert InvalidAddress();
        if (msg.value == 0) revert InvalidAmount();
        balanceOf[beneficiary] += msg.value;
        totalStored += msg.value;
        records[beneficiary].push(Record(msg.value, msg.sender, uint64(block.timestamp), uint64(block.number), 0));
        emit Stored(msg.sender, beneficiary, msg.value);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        balanceOf[msg.sender] -= amount;
        totalStored -= amount;
        records[msg.sender].push(Record(amount, msg.sender, uint64(block.timestamp), uint64(block.number), 1));
        (bool paid,) = payable(msg.sender).call{value: amount}("");
        if (!paid) revert PaymentFailed();
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Newest-first history, bounded to 25 records per read.
    function transactions(address wallet, uint256 offset, uint256 limit)
        external view returns (Record[] memory page, uint256 total)
    {
        total = records[wallet].length;
        if (offset >= total || limit == 0) return (new Record[](0), total);
        if (limit > 25) limit = 25;
        uint256 count = total - offset;
        if (count > limit) count = limit;
        page = new Record[](count);
        for (uint256 i; i < count; ++i) page[i] = records[wallet][total - offset - i - 1];
    }

    receive() external payable { revert UseStoreFunction(); }
    fallback() external payable { revert UseStoreFunction(); }
}
