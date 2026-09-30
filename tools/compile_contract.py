"""Compile CourseLedger with the same Solidity version used in Remix."""
import argparse
import hashlib
import json
import os
from pathlib import Path

import solcx

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.8.30"


def compile_contract(install=False):
    compiler_dir = ROOT / ".cache" / "solc"
    compiler_dir.mkdir(parents=True, exist_ok=True)
    # solcx validation also reads this environment variable on Windows.
    os.environ["SOLCX_BINARY_PATH"] = str(compiler_dir)
    if install:
        solcx.install_solc(VERSION, solcx_binary_path=compiler_dir)
    binary = solcx.install.get_executable(VERSION, solcx_binary_path=compiler_dir)
    source = (ROOT / "contracts" / "CourseLedger.sol").read_text(encoding="utf-8")
    compiled = solcx.compile_standard({
        "language": "Solidity",
        "sources": {"CourseLedger.sol": {"content": source}},
        "settings": {
            "optimizer": {"enabled": False, "runs": 200},
            "evmVersion": "prague",
            "outputSelection": {"*": {"*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"]}},
        },
    }, solc_binary=binary)
    contract = compiled["contracts"]["CourseLedger.sol"]["CourseLedger"]
    artifact = {
        "contractName": "CourseLedger", "compiler": VERSION, "evmVersion": "prague",
        "sourceSha256": hashlib.sha256(source.encode()).hexdigest(),
        "abi": contract["abi"],
        "bytecode": "0x" + contract["evm"]["bytecode"]["object"],
        "deployedBytecode": "0x" + contract["evm"]["deployedBytecode"]["object"],
    }
    output = ROOT / "build" / "CourseLedger.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    return artifact


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--install", action="store_true", help="Download Solidity 0.8.30 if needed.")
    args = parser.parse_args()
    result = compile_contract(args.install)
    print(f"Compiled {result['contractName']} with Solidity {VERSION}; output: build/CourseLedger.json")

