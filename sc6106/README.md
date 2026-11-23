# SC6106 Sepolia DApp

A separate implementation of the course practice site, based on the user's November 23, 2026 request. Main has Transfer Money, Store, and Exit. Store uses native Sepolia ETH, not the previous CourseLedger demonstration credits.

## Behavior

- Transfer Money sends native Sepolia ETH directly from the connected wallet to the entered recipient.
- Store deposits native ETH into `SepoliaStore.store(beneficiary)`. The entered wallet owns that balance; only that wallet can withdraw it. Depositing for another wallet transfers withdrawal rights to that wallet.
- Transaction shows that wallet's stored balance and on-chain deposit/withdrawal history, newest first, 25 records per page. These are Store records, not every transfer the wallet has ever made.
- Withdrawal returns ETH only to the connected balance owner. Gas is paid from the wallet's external balance.
- Main returns to the menu. Exit leaves the forms; it does not revoke wallet permissions.

The browser validates Sepolia chain ID 11155111, exact wei amounts, account changes, and the configured contract's compiled runtime code hash. Every write displays a review dialog and requires wallet confirmation. The server never accepts or stores private keys. Read-only history uses two public Sepolia RPC endpoints. Addresses and transaction records are public on-chain.

## Local development and checks

Python 3.11+ and Node 20+ are suitable. Install Python requirements in a virtual environment. JavaScript development dependencies are pinned in `pnpm-lock.yaml`.

```text
python -m pip install -r requirements.txt
pnpm install --ignore-scripts
node tools/compile.cjs
node --test tests/*.test.cjs
python -m unittest discover -s tests -p "test_*.py"
python app.py
```

The local page is `http://127.0.0.1:6106/main`. The compiled contract artifact and vendored ethers browser library are committed, so Render does not compile Solidity or install Node dependencies.

## Free Render deployment

Create a new Python web service from `hoonjang98-rgb/SC6113-AY2026T1`, branch `codex/sc6106-native-store`, root directory `sc6106`, service name `sc6106-ay2026t1`, **Free** instance. Build: `pip install -r requirements.txt`. Start: `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 app:app`. Health check: `/health`. No database, RPC key, wallet secret, or paid add-on is required. Free instances may sleep when idle.

## Connect the Store contract

1. Open `/setup` in a browser with an Ethereum wallet, unlock it, and select Ethereum Sepolia with enough test ETH for deployment gas.
2. Deploy Store contract, review the network and code hash, and confirm in the wallet. No ETH value is sent with deployment; gas is required.
3. Record the confirmed public deployment JSON in `static/deployment.json`, publish that change to the deployment branch, and wait for Render to redeploy.
4. Verify the runtime code matches the artifact before testing a small Store deposit and withdrawal. Do not describe local Ganache tests as Sepolia transactions.

When deployment.json has a null address, Store and Transaction intentionally report that setup is unfinished. Transfer Money does not depend on the Store deployment. The public setup page cannot change the shared deployment configuration.

## Contract scope

Solidity 0.8.30, optimizer 200, Shanghai EVM. No administrator, upgrades, emergency withdrawal, or arbitrary target calls. Deposits reject zero/self beneficiary and zero value. Direct ETH transfers revert. Withdrawals use checks-effects-interactions and a reentrancy guard. Failed recipient payments revert balances and history. Forced ETH can exceed accounted balances and is not assigned to any wallet. This is a classroom testnet contract; it has not received an independent audit.

The inherited source snapshot and original Render service are separate. `BASELINE.json` records the starting repository commit; this implementation does not establish completion of the new course's group submission.
