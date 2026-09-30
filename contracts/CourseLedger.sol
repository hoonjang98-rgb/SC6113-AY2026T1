// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Teaching ledger only. Credits have no value and are freely created.
/// @dev Preserves the function signatures used by the original course frontend.
contract CourseLedger {
    mapping(address => uint256) public balanceOf;
    address private lastDepositor;
    uint256 private lastAmount;

    event Deposited(address indexed depositor, uint256 amount);
    event Transferred(address indexed payer, address indexed payee, uint256 amount);

    function depositMoney(address depositorInput, uint256 amountInput) external {
        require(depositorInput == msg.sender, "Depositor must be sender");
        require(amountInput > 0, "Amount must be positive");
        balanceOf[msg.sender] += amountInput;
        lastDepositor = msg.sender;
        lastAmount = amountInput;
        emit Deposited(msg.sender, amountInput);
    }

    // This is the latest deposit across ALL accounts, not a wallet's balance.
    function viewDeposit() external view returns (address, uint256) {
        return (lastDepositor, lastAmount);
    }

    function transfer(address payer_add, address payee_add, uint256 amount_transfer) external {
        require(payer_add == msg.sender, "Payer must be sender");
        require(payee_add != address(0), "Payee must not be zero");
        require(payee_add != payer_add, "Payee must differ from payer");
        require(amount_transfer > 0, "Amount must be positive");
        require(balanceOf[payer_add] >= amount_transfer, "Insufficient credits");
        balanceOf[payer_add] -= amount_transfer;
        balanceOf[payee_add] += amount_transfer;
        emit Transferred(payer_add, payee_add, amount_transfer);
    }
}
