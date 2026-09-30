import unittest

from eth_tester.exceptions import TransactionFailed
from web3 import EthereumTesterProvider, Web3

from tools.compile_contract import compile_contract

ZERO = "0x" + "0" * 40


class ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.artifact = compile_contract()

    def setUp(self):
        self.web3 = Web3(EthereumTesterProvider())
        self.alice, self.bob, self.eve = self.web3.eth.accounts[:3]
        factory = self.web3.eth.contract(abi=self.artifact["abi"], bytecode=self.artifact["bytecode"])
        receipt = self.web3.eth.wait_for_transaction_receipt(factory.constructor().transact({"from": self.alice}))
        self.assertEqual(receipt.status, 1)
        self.contract = self.web3.eth.contract(address=receipt.contractAddress, abi=self.artifact["abi"])

    def deposit(self, amount=100, account=None):
        account = account or self.alice
        return self.contract.functions.depositMoney(account, amount).transact({"from": account})

    def balance(self, account):
        return self.contract.functions.balanceOf(account).call()

    def test_initial_state(self):
        self.assertEqual(self.balance(self.alice), 0)
        self.assertEqual(self.contract.functions.viewDeposit().call(), [ZERO, 0])

    def test_deposit_records_and_accumulates_demo_credits(self):
        self.deposit(100)
        self.deposit(25)
        self.assertEqual(self.balance(self.alice), 125)
        self.assertEqual(self.contract.functions.viewDeposit().call(), [self.alice, 25])

    def test_latest_record_is_global(self):
        self.deposit(100)
        self.deposit(12, self.bob)
        self.assertEqual(self.contract.functions.viewDeposit().call(), [self.bob, 12])
        self.assertEqual(self.balance(self.alice), 100)

    def test_transfer_conserves_total_and_emits_event(self):
        self.deposit()
        tx = self.contract.functions.transfer(self.alice, self.bob, 30).transact({"from": self.alice})
        receipt = self.web3.eth.wait_for_transaction_receipt(tx)
        self.assertEqual((self.balance(self.alice), self.balance(self.bob)), (70, 30))
        events = self.contract.events.Transferred().process_receipt(receipt)
        self.assertEqual(events[0]["args"]["amount"], 30)

    def test_only_sender_can_deposit_for_self(self):
        with self.assertRaises(TransactionFailed):
            self.contract.functions.depositMoney(self.alice, 100).transact({"from": self.eve})
        self.assertEqual(self.balance(self.alice), 0)

    def test_other_account_cannot_spend_payer_credits(self):
        self.deposit()
        with self.assertRaises(TransactionFailed):
            self.contract.functions.transfer(self.alice, self.eve, 10).transact({"from": self.eve})
        self.assertEqual(self.balance(self.alice), 100)

    def test_insufficient_credits_revert_without_state_change(self):
        self.deposit()
        with self.assertRaises(TransactionFailed):
            self.contract.functions.transfer(self.alice, self.bob, 101).transact({"from": self.alice})
        self.assertEqual((self.balance(self.alice), self.balance(self.bob)), (100, 0))

    def test_zero_deposit_and_transfer_revert(self):
        with self.assertRaises(TransactionFailed):
            self.deposit(0)
        with self.assertRaises(TransactionFailed):
            self.contract.functions.transfer(self.alice, self.bob, 0).transact({"from": self.alice})

    def test_zero_and_self_payees_revert(self):
        self.deposit()
        for payee in (ZERO, self.alice):
            with self.subTest(payee=payee), self.assertRaises(TransactionFailed):
                self.contract.functions.transfer(self.alice, payee, 1).transact({"from": self.alice})
        self.assertEqual(self.balance(self.alice), 100)

    def test_uint256_overflow_reverts_atomically(self):
        self.deposit(2**256 - 1)
        with self.assertRaises(TransactionFailed):
            self.deposit(1)
        self.assertEqual(self.balance(self.alice), 2**256 - 1)
        self.assertEqual(self.contract.functions.viewDeposit().call(), [self.alice, 2**256 - 1])

    def test_native_eth_is_rejected(self):
        with self.assertRaises(TransactionFailed):
            # Bypass Web3's nonpayable client check to exercise the EVM itself.
            self.web3.eth.send_transaction({
                "from": self.alice, "to": self.contract.address, "value": 1,
                "data": self.contract.encode_abi("depositMoney", args=[self.alice, 1]),
            })
        self.assertEqual(self.balance(self.alice), 0)


if __name__ == "__main__":
    unittest.main()
