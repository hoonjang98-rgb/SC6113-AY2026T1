"""Isolated EVM + Flask fixture. Never use this server for deployment."""
import json
import sys
from collections.abc import Mapping
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from flask import jsonify, request
from web3 import EthereumTesterProvider, Web3
from werkzeug.serving import make_server
from app import create_app
from tools.compile_contract import compile_contract


def rpc_value(value):
    if isinstance(value, bytes):
        return Web3.to_hex(value)
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return hex(value)
    if isinstance(value, Mapping):
        return {k: rpc_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [rpc_value(v) for v in value]
    return value


def main():
    web3 = Web3(EthereumTesterProvider())
    artifact = compile_contract()
    factory = web3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
    receipt = web3.eth.wait_for_transaction_receipt(factory.constructor().transact({"from": web3.eth.accounts[0]}))
    contract = web3.eth.contract(address=receipt.contractAddress, abi=artifact["abi"])
    app = create_app({
        "CHAIN_ID": str(web3.eth.chain_id),
        "TRANSFER_CONTRACT_ADDRESS": receipt.contractAddress,
        "DEPOSIT_CONTRACT_ADDRESS": receipt.contractAddress,
    })

    @app.post("/__test_rpc")
    def rpc():
        payload = request.get_json()
        try:
            params = payload.get("params", [])
            # JSON-RPC accepts lowercase addresses; Web3.py's public API wants checksums.
            if params and isinstance(params[0], dict):
                for key in ("from", "to"):
                    if params[0].get(key):
                        params[0][key] = Web3.to_checksum_address(params[0][key])
            elif payload["method"] in ("eth_getCode", "eth_getBalance", "eth_getTransactionCount"):
                params[0] = Web3.to_checksum_address(params[0])
            result = web3.manager.request_blocking(payload["method"], params)
            return jsonify({"jsonrpc": "2.0", "id": payload.get("id", 1), "result": rpc_value(result)})
        except Exception as exc:
            return jsonify({"jsonrpc": "2.0", "id": payload.get("id", 1),
                            "error": {"code": -32000, "message": str(exc)}})

    @app.get("/__test_state")
    def state():
        return jsonify({
            "accounts": web3.eth.accounts,
            "balances": [str(contract.functions.balanceOf(a).call()) for a in web3.eth.accounts[:2]],
            "chainId": hex(web3.eth.chain_id),
        })

    server = make_server("127.0.0.1", 0, app)
    print(json.dumps({"url": f"http://127.0.0.1:{server.server_port}"}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
