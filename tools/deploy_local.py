"""Deploy or adopt CourseLedger on the loopback Anvil teaching chain only."""
import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import dotenv_values, set_key
from web3 import Web3
from tools.compile_contract import ROOT, compile_contract

CHAIN_ID = 31337


def local_web3(rpc_url):
    parsed = urlparse(rpc_url)
    if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("This helper only accepts a loopback HTTP Anvil node.")
    web3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 20}))
    if not web3.is_connected():
        raise ValueError("Local node is not running. Start npm run chain in another terminal.")
    if web3.eth.chain_id != CHAIN_ID or "anvil" not in web3.client_version.lower():
        raise ValueError("Expected Anvil with chain ID 31337.")
    return web3


def deploy(rpc_url, address=None, install=False, write_env=False):
    web3 = local_web3(rpc_url)
    artifact = compile_contract(install)
    expected_code = bytes.fromhex(artifact["deployedBytecode"][2:])
    env_path = ROOT / ".env"
    current = dotenv_values(env_path) if env_path.exists() else {}
    if not address and current.get("CHAIN_ID") == str(CHAIN_ID):
        candidate = current.get("TRANSFER_CONTRACT_ADDRESS", "")
        if web3.is_address(candidate) and bytes(web3.eth.get_code(Web3.to_checksum_address(candidate))) == expected_code:
            address = candidate
    if address:
        address = Web3.to_checksum_address(address)
        if bytes(web3.eth.get_code(address)) != expected_code:
            raise ValueError("The address does not contain this compiled CourseLedger bytecode.")
        transaction_hash = None
    else:
        factory = web3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
        tx = factory.constructor().transact({"from": web3.eth.accounts[0]})
        receipt = web3.eth.wait_for_transaction_receipt(tx, timeout=60)
        if receipt.status != 1:
            raise ValueError("Deployment reverted.")
        address = receipt.contractAddress
        transaction_hash = Web3.to_hex(receipt.transactionHash)
    record = {
        "network": "local Anvil teaching chain", "chainId": CHAIN_ID,
        "rpcUrl": rpc_url, "contractAddress": address,
        "transactionHash": transaction_hash, "sourceSha256": artifact["sourceSha256"],
        "accounts": web3.eth.accounts[:2],
    }
    output = ROOT / ".cache" / "local-deployment.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    if write_env:
        env_path.touch(exist_ok=True)
        for key, value in {
            "CHAIN_ID": str(CHAIN_ID),
            "TRANSFER_CONTRACT_ADDRESS": address,
            "DEPOSIT_CONTRACT_ADDRESS": address,
        }.items():
            set_key(str(env_path), key, value, quote_mode="never")
    return record


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rpc-url", default="http://127.0.0.1:8545")
    parser.add_argument("--address", help="Adopt an address already deployed through Remix.")
    parser.add_argument("--install", action="store_true", help="Install Solidity 0.8.30 if needed.")
    parser.add_argument("--write-env", action="store_true", help="Update only the three public DApp settings.")
    args = parser.parse_args()
    try:
        record = deploy(args.rpc_url, args.address, args.install, args.write_env)
    except Exception as exc:
        parser.exit(1, f"Local deployment failed: {exc}\n")
    print(json.dumps(record, indent=2))
    if args.write_env:
        print("Public DApp settings written to .env. Restart Flask to load them.")

