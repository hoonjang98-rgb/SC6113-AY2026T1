/* Shared wallet handling for the two course contract operations. */
(function (root) {
    "use strict";
    const ZERO = "0x0000000000000000000000000000000000000000";
    const UINT256_MAX = (1n << 256n) - 1n;
    const TRANSFER_ABI = [{
        inputs: [{name: "payer_add", type: "address"}, {name: "payee_add", type: "address"},
            {name: "amount_transfer", type: "uint256"}],
        name: "transfer", outputs: [], stateMutability: "nonpayable", type: "function"
    }];
    const DEPOSIT_ABI = [{
        inputs: [{name: "depositorInput", type: "address"}, {name: "amountInput", type: "uint256"}],
        name: "depositMoney", outputs: [], stateMutability: "nonpayable", type: "function"
    }, {
        inputs: [], name: "viewDeposit",
        outputs: [{name: "", type: "address"}, {name: "", type: "uint256"}],
        stateMutability: "view", type: "function"
    }];

    function parseAmount(value) {
        const amount = String(value).trim();
        if (!/^[1-9][0-9]*$/.test(amount) || amount.length > 78 || BigInt(amount) > UINT256_MAX) {
            throw new Error("Enter a positive whole number no greater than uint256 maximum.");
        }
        return amount; // Never convert contract amounts to an imprecise JS Number.
    }

    function parseChainId(value) {
        const chain = String(value ?? "").trim();
        if (!/^(?:[1-9][0-9]*|0x[0-9a-fA-F]+)$/.test(chain) || BigInt(chain) <= 0n) {
            throw new Error("Set a valid CHAIN_ID in .env and restart the server.");
        }
        return BigInt(chain);
    }

    function errorMessage(error) {
        const code = Number(error && error.code);
        if (code === 4001) return "Request cancelled in the wallet.";
        if (code === -32002) return "A wallet request is already pending. Open MetaMask.";
        if (code === 4900 || code === 4901) return "Wallet disconnected. Reconnect and reload this page.";
        return (error && error.message) || "The contract operation failed.";
    }

    function createClient(config, provider, Web3, onAccount = () => {}) {
        let revision = 0;
        function invalidate() { revision += 1; }
        function web3Instance() {
            if (!provider || typeof provider.request !== "function") {
                throw new Error("MetaMask was not detected. Install or enable the wallet extension.");
            }
            if (typeof Web3 !== "function") {
                throw new Error("Web3.js did not load. Check your connection to cdn.jsdelivr.net and reload.");
            }
            return new Web3(provider);
        }
        function validAddress(web3, address, label) {
            if (!web3.utils.isAddress(address) || address.toLowerCase() === ZERO) {
                throw new Error("Enter a valid, non-zero " + label + " address.");
            }
        }
        async function checkChain() {
            const expected = parseChainId(config.chainId);
            const actual = BigInt(await provider.request({method: "eth_chainId"}));
            if (actual !== expected) throw new Error("Wrong network. Switch MetaMask to chain ID " + expected + ".");
            return actual;
        }
        async function connect() {
            const web3 = web3Instance();
            await checkChain();
            const accounts = await provider.request({method: "eth_requestAccounts"});
            if (!accounts || !accounts[0]) throw new Error("No wallet account is connected.");
            validAddress(web3, accounts[0], "wallet");
            await assertCurrent({account: accounts[0], snapshot: revision});
            onAccount(accounts[0]);
            return accounts[0];
        }
        async function context(kind, write) {
            const web3 = web3Instance();
            const address = String(config[kind + "Address"] || "").trim();
            validAddress(web3, address, kind + " contract (configure .env)");
            const account = write ? await connect() : null;
            const snapshot = revision;
            await checkChain();
            const code = await web3.eth.getCode(address);
            if (!code || /^0x0*$/i.test(code)) {
                throw new Error("Contract not found on this network. Check its deployment address.");
            }
            const contract = new web3.eth.Contract(kind === "transfer" ? TRANSFER_ABI : DEPOSIT_ABI, address);
            const state = {account, snapshot, contract, web3};
            await assertCurrent(state);
            return state;
        }
        async function assertCurrent(state) {
            await checkChain();
            if (state.account) {
                const accounts = await provider.request({method: "eth_accounts"});
                if (!accounts || !accounts[0] || accounts[0].toLowerCase() !== state.account.toLowerCase()) {
                    throw new Error("Wallet account changed. Review the details and try again.");
                }
            }
            if (state.snapshot !== revision) throw new Error("Wallet or network changed. Review the details and try again.");
        }
        async function send(state, method, onStatus) {
            await assertCurrent(state);
            onStatus("Confirm the transaction in MetaMask, then wait for confirmation.");
            const pending = method.send({from: state.account});
            if (pending && typeof pending.on === "function") {
                pending.on("transactionHash", hash => onStatus("Transaction submitted: " + hash + ". Waiting for confirmation."));
            }
            const receipt = await pending;
            if (!receipt || ![true, 1, 1n, "1", "0x1"].includes(receipt.status)) {
                throw new Error("Transaction reverted or was not confirmed successfully.");
            }
            // If the wallet changed after submission, do not label a new context as successful.
            if (state.snapshot !== revision) {
                throw new Error("Transaction confirmed in the previous wallet context: " + receipt.transactionHash + ". Reload to refresh.");
            }
            return receipt.transactionHash;
        }
        return {
            invalidate, connect,
            async transfer(payee, value, onStatus = () => {}) {
                const amount = parseAmount(value);
                const web3 = web3Instance();
                payee = String(payee).trim();
                validAddress(web3, payee, "payee");
                const state = await context("transfer", true);
                if (payee.toLowerCase() === state.account.toLowerCase()) {
                    throw new Error("Payee must differ from the connected payer.");
                }
                return send(state, state.contract.methods.transfer(state.account, payee, amount), onStatus);
            },
            async deposit(value, onStatus = () => {}) {
                const amount = parseAmount(value);
                const state = await context("deposit", true);
                return send(state, state.contract.methods.depositMoney(state.account, amount), onStatus);
            },
            async viewDeposit() {
                const state = await context("deposit", false);
                const result = await state.contract.methods.viewDeposit().call();
                await assertCurrent(state);
                return {depositor: result[0], amount: String(result[1])};
            }
        };
    }

    function init() {
        const doc = root.document;
        const configElement = doc.getElementById("dapp-config");
        if (!configElement) return;
        const config = JSON.parse(configElement.textContent);
        const provider = root.ethereum;
        const status = doc.getElementById("status");
        const payer = doc.getElementById("payer");
        const result = doc.getElementById("deposit-result");
        const client = createClient(config, provider, root.Web3, account => {
            if (payer) payer.value = account;
        });
        let busy = false;
        function setStatus(message, error = false) {
            status.textContent = message;
            status.dataset.error = String(error);
        }
        async function run(operation) {
            if (busy) return;
            busy = true;
            const controls = Array.from(doc.querySelectorAll("button, input:not([readonly])"));
            controls.forEach(control => { control.disabled = true; });
            if (result) result.textContent = "";
            setStatus("Checking wallet and contract…");
            try {
                await operation(message => setStatus(message));
            } catch (error) {
                setStatus(errorMessage(error), true);
            } finally {
                busy = false;
                controls.forEach(control => { control.disabled = false; });
            }
        }
        const connectButton = doc.getElementById("connect");
        if (connectButton) connectButton.addEventListener("click", () => run(async report => {
            const account = await client.connect();
            payer.value = account;
            report("Connected: " + account);
        }));
        const transferForm = doc.getElementById("transfer-form");
        if (transferForm) transferForm.addEventListener("submit", event => {
            event.preventDefault();
            const payee = doc.getElementById("payee").value;
            const amount = doc.getElementById("amount").value;
            run(async report => {
                const hash = await client.transfer(payee, amount, report);
                report("Transfer confirmed. Transaction: " + hash);
            });
        });
        const depositForm = doc.getElementById("deposit-form");
        if (depositForm) depositForm.addEventListener("submit", event => {
            event.preventDefault();
            const amount = doc.getElementById("amount").value;
            run(async report => {
                const hash = await client.deposit(amount, report);
                report("Deposit recorded. Transaction: " + hash);
            });
        });
        const viewButton = doc.getElementById("view-deposit");
        if (viewButton) viewButton.addEventListener("click", () => run(async report => {
            const deposit = await client.viewDeposit();
            result.textContent = deposit.depositor.toLowerCase() === ZERO
                ? "No deposit has been recorded yet."
                : "Latest depositor: " + deposit.depositor + " | Amount: " + deposit.amount;
            report("Latest deposit record loaded (all accounts).");
        }));
        if (provider && typeof provider.on === "function") {
            const changed = () => {
                client.invalidate();
                if (payer) payer.value = "";
                if (result) result.textContent = "";
                setStatus("Wallet or network changed. Review the network and reconnect before retrying. Any submitted transaction may still complete.", true);
            };
            provider.on("accountsChanged", changed);
            provider.on("chainChanged", changed);
            provider.on("disconnect", changed);
            root.addEventListener("pagehide", () => {
                if (typeof provider.removeListener === "function") {
                    provider.removeListener("accountsChanged", changed);
                    provider.removeListener("chainChanged", changed);
                    provider.removeListener("disconnect", changed);
                }
            }, {once: true});
        }
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = {parseAmount, parseChainId, errorMessage, createClient, UINT256_MAX};
    } else {
        init();
    }
})(typeof window !== "undefined" ? window : globalThis);
