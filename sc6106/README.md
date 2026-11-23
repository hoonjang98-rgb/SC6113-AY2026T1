# SC6106 Sepolia DApp

A separate implementation of the course practice site, based on the user's November 23, 2026 request. Main has Transfer Money, Store, and Exit. Store uses native Sepolia ETH, not the previous CourseLedger demonstration credits.

## Behavior

- Transfer Money sends native Sepolia ETH directly from the connected wallet to the entered recipient.
- Store deposits native ETH into `SepoliaStore.store(beneficiary)`. The entered wallet owns that balance; only that wallet can withdraw it. Depositing for another wallet transfers withdrawal rights to that wallet.
- Transaction shows that wallet's stored balance and on-chain deposit/withdrawal history, newest first, 25 records per page. These are Store records, not every transfer the wallet has ever made.
- Withdrawal returns ETH only to the connected balance owner. Gas is paid from the wallet's external balance.
- Main returns to the menu. Exit leaves the forms; it does not revoke wallet permissions.

## Live Sepolia contract

The Store contract was deployed and verified on Ethereum Sepolia on 23 November 2026. Address: `0x2d1e9a642bcd104147bb53b4ffc0f010f5983a3b`. Deployment transaction: `0x8a8704326fb48c11a25afee75b966634eaf53b3c56cca8aa2f36cdf459af60b7` (block 12195684). The transaction value was 0 ETH; the deployer paid only Sepolia gas. The submitted creation bytecode and on-chain runtime hash both match the reviewed artifact. See [deployment evidence](evidence/sepolia-deployment-2026-11-23.json).

The browser validates Sepolia chain ID 11155111, exact wei amounts, account changes, and the configured contract's compiled runtime code hash. Every write displays a review dialog and requires wallet confirmation. The server never accepts or stores private keys. Read-only history uses two public Sepolia RPC endpoints. Addresses and transaction records are public on-chain.

## Local development and checks

Python 3.12+ and Node 20+ are suitable. Install Python requirements in a virtual environment. Python packages are pinned with PyPI SHA-256 hashes; JavaScript dependencies are pinned in `pnpm-lock.yaml`. Installation lifecycle scripts are disabled in `pnpm-workspace.yaml`.

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

## Contract setup and deployment record

`static/deployment.json` now points to the verified public deployment above. The `/setup` page disables deployment when this configuration is live. A small Store deposit and beneficiary withdrawal have not yet been submitted; these require separate wallet transactions and gas. Local EthereumJS EVM tests are simulations, not public Sepolia transactions.

When deployment.json has a null address, Store and Transaction intentionally report that setup is unfinished. Transfer Money does not depend on the Store deployment. The public setup page cannot change the shared deployment configuration.

## Contract scope

Solidity 0.8.39, optimizer 200, Shanghai EVM. Deployment rejects chains other than Sepolia. No administrator, upgrades, emergency withdrawal, or arbitrary target calls. Deposits reject zero/self beneficiary and zero value. Direct ETH transfers revert. Withdrawals use checks-effects-interactions and a reentrancy guard. Failed recipient payments revert balances and history. Forced ETH can exceed accounted balances and is not assigned to any wallet. This is a classroom testnet contract; it has not received an independent audit.

## Privacy and security checks

The app has no login, database, analytics, cookies, private-key field, token approval, message signing, or file upload. Wallet signing remains in the extension. Address lookup navigation uses a URL fragment, then removes it from browser history; it is not sent to Render in the request URL. The app sends read requests to the documented public RPC services, which can observe the requesting IP and address. Ethereum transactions and beneficiary balances are public, not confidential.

See `SECURITY_REVIEW.md` for the dated scope and remaining limits. Run `node tools/dependency-audit.cjs` to query installed packages, including bundled dependencies, in addition to `pnpm audit`. The former needs an `evidence` directory for local results. The review replaced Ganache with an isolated EthereumJS EVM; it opens no network listener and uses no signing keys.

The inherited source snapshot and original Render service are separate. `BASELINE.json` records the starting repository commit; this implementation does not establish completion of the new course's group submission.
