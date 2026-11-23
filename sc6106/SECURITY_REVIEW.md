# Security review — 23 November 2026

## Scope and result

Reviewed the SC6106 practice app, its initial public deployment, its deployment branch, and all 13 reachable commits / 81 distinct text blobs (709,691 bytes) in the containing public repository before this remediation. The new app baseline was `4d9075cc8c0d314c534ece55bc12dfb4c8a9661a`. The legacy SC6113 app was included in historical secret screening, not retested as a separate production app.

No user private key, seed phrase, authentication token, or malicious data-exfiltration mechanism was identified in the inspected app and Git history. Two credential-pattern candidates were an upstream ethers public default provider identifier and a deliberately fake test secret; neither was a user credential. No private .env, database, wallet profile, executable installer, or personal home-directory path was found among the published files. Git author identity is public metadata; a non-noreply author email exists in historical commits. This review does not erase historical Git objects or third-party copies.

This is a scoped source, dependency, malware, and behavior review, not a guarantee against all vulnerabilities or an independent smart-contract audit. It does not certify the whole computer, installed browser extensions, GitHub/Render account security, provider infrastructure, or future dependency releases.

## Findings and remediation

| Finding | Impact and exposure | Remediation |
|---|---|---|
| Five initial lockfile advisories in ws/tmp | Development-only dependencies: memory disclosure, denial of service, and unsafe temporary paths. No evidence of an exploit against this user. | Updated ethers to 6.17.0, Solidity to 0.8.39; pinned ws 8.23.0 and tmp 0.2.7. |
| Ganache bundled elliptic / secp256k1 / bn.js missed by lockfile-only audit | Included critical/private-key-extraction advisories. Ganache had been used only with ephemeral test accounts, never with a user's private key, and was not installed on Render. | Removed Ganache entirely. Replaced it with EthereumJS 10.1.3 in-memory execution, without a listening RPC server or signing keys. Installed-package audit now includes bundled manifests. |
| Lookup wallet address in URL query | A lookup could link a public address to an IP in hosting access logs and browser history. | Use a fragment, immediately remove it from the history entry, prohibit native form submission, remove named Store inputs, and set no-referrer. This does not hide public blockchain data or public RPC requests. |
| Unpinned Python installation and old Gunicorn branch | Future resolution could change without review; Gunicorn 23 lacked later HTTP parsing hardening. | Pin Python packages and official wheel hashes; use Gunicorn 27.0.1. Only binary distributions are accepted. |
| Defense-in-depth gaps | Host-header trust, oversized bodies, accidental non-Sepolia contract deployment, unnecessary browser capabilities. | Allowlist expected hosts, bound request bodies to 16 KiB, add network check in contract constructor, restrictive Permissions-Policy, HSTS, frame denial, and CSP. |
| Historical author email | Public Git metadata can reveal an author's email; this is separate from wallet compromise. | Remediation commits use GitHub noreply identity. Removing old identities requires coordinated history rewriting and may still require GitHub cache/fork cleanup. |

Sources: [ws memory disclosure](https://github.com/advisories/GHSA-58qx-3vcg-4xpx), [ws exhaustion](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), [tmp traversal](https://github.com/advisories/GHSA-ph9p-34f9-6g65), [elliptic key extraction](https://github.com/advisories/GHSA-vjh7-7g9h-fjfh), [secp256k1 key extraction](https://github.com/advisories/GHSA-584q-6j8j-r5pm), [Solidity known bugs](https://docs.solidity.org/en/latest/bugs.html), [Gunicorn fixes](https://gunicorn.org/news/).

## Validation before publishing fixes

- Windows x64, build 26200; Node 24.22.3; dedicated Python 3.12.14 environment.
- Windows Defender custom scan of the project: no threats found. Second scan after replacing node_modules: no threats found. No automatic remediation or full-system scan was performed.
- npm lockfile audit: zero reported advisories after fixes. Installed package manifests, including bundled packages: 37 packages, zero reported advisories in npm's bulk database.
- PyPI version metadata: no reported advisories for the eight pinned runtime packages at review time. Dependency resolution and hash verification passed; `pip check` found no broken requirements.
- Node: 18 passing tests, zero failures (input guards, wrong-chain deployment, beneficiary ownership, native balance accounting, rollback, reentrancy, pagination, cancelled/rejected wallet requests, network/account changes, insufficient funds, and duplicate submission).
- Flask: 5 passing tests, zero failures, covering routes, private file access denial, traversal attempts, XSS non-reflection, host validation, body limit, CSP, referrer restrictions, blank wallet input, and no cookie.
- Vendored ethers matches the installed official package distribution byte-for-byte. Solidity artifact was rebuilt from reviewed source with 0.8.39, optimizer 200, Shanghai. Runtime hash: `0x2b80b1c158996c37f57381726d60db29e22c00a6219320f2f67073f93510809f`.
- Reviewed first-party runtime paths for arbitrary execution, unsafe DOM insertion, key/seed access, cookie/storage harvesting, token approvals, message signatures, analytics, persistence and hidden network endpoints. None identified. Server only serves pages/assets; writes are native ETH wallet transactions after review. No source or secret is uploaded by the advisory audit tools, only public package names/versions.

## Remaining boundaries

The Store contract remains undeployed on public Sepolia at this checkpoint (`static/deployment.json` address is null). No real wallet transaction was signed during this review. Public deployment verification is recorded separately in the local evidence directory after rollout. These simulation results are not public-chain transaction evidence.

Deposits for another address give that address withdrawal rights permanently. A mistyped valid address, lost private key, malicious extension, compromised hosting/account, or misleading wallet confirmation can still cause loss. Public RPC endpoints can log IPs and queried addresses. Amounts, sender/beneficiary addresses, balances, and transaction history are public on Ethereum. Use test funds; never enter private keys or seed phrases into the site.

On the user's next follow-up, verify the deployed revision and wallet behavior again, especially the actual deployment receipt/code and deposit/withdrawal if the user chooses to finish setup. No automatic follow-up job was scheduled.
