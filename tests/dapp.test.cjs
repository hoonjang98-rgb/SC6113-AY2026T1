const {test} = require("node:test");
const assert = require("node:assert/strict");
const {parseAmount, parseChainId, errorMessage, createClient, UINT256_MAX} = require("../static/dapp.js");
const ACCOUNT = "0x" + "1".repeat(40);
const PAYEE = "0x" + "2".repeat(40);
const CONTRACT = "0x" + "3".repeat(40);
const ZERO = "0x" + "0".repeat(40);

function fixture(options = {}) {
    const requests = [], calls = [];
    let account = ACCOUNT;
    let chain = "0x539";
    const provider = {
        async request({method}) {
            requests.push(method);
            if (options.request) {
                const result = await options.request(method);
                if (result !== undefined) return result;
            }
            if (method === "eth_chainId") return chain;
            if (method === "eth_requestAccounts" || method === "eth_accounts") return account ? [account] : [];
            throw new Error("Unexpected RPC: " + method);
        }
    };
    const receipt = options.receipt ?? {status: true, transactionHash: "0xconfirmed"};
    const send = async (name, args, tx) => {
        calls.push({name, args, tx});
        if (options.onSend) await options.onSend();
        if (options.sendError) throw options.sendError;
        return receipt;
    };
    class Web3 {
        constructor() {
            this.utils = {isAddress: value => /^0x[0-9a-fA-F]{40}$/.test(value)};
            this.eth = {
                getCode: async () => {
                    if (options.onCode) await options.onCode();
                    return options.code ?? "0x6000";
                },
                Contract: class {
                    constructor() {
                        this.methods = {
                            transfer: (...args) => ({send: tx => send("transfer", args, tx)}),
                            depositMoney: (...args) => ({send: tx => send("depositMoney", args, tx)}),
                            viewDeposit: () => ({call: async () => {
                                if (options.onView) await options.onView();
                                return options.record ?? [ACCOUNT, "100"];
                            }})
                        };
                    }
                }
            };
        }
    }
    const client = createClient({
        chainId: options.chainId ?? "1337",
        transferAddress: options.address ?? CONTRACT,
        depositAddress: options.address ?? CONTRACT
    }, provider, Web3);
    return {client, calls, requests, setAccount: value => {account = value;}, setChain: value => {chain = value;}};
}

test("uint256 amounts preserve all digits", () => {
    assert.equal(parseAmount("9007199254740993"), "9007199254740993");
    assert.equal(parseAmount(UINT256_MAX.toString()), UINT256_MAX.toString());
    assert.equal(parseAmount(" 12 "), "12");
});
test("invalid and overflowing amounts are rejected", () => {
    for (const value of ["", "0", "-1", "1.2", "1e3", "01", "NaN", "Infinity", (UINT256_MAX + 1n).toString()]) {
        assert.throws(() => parseAmount(value), /positive whole number/);
    }
});
test("chain IDs support decimal and hexadecimal", () => {
    assert.equal(parseChainId("1337"), 1337n);
    assert.equal(parseChainId("0x539"), 1337n);
    for (const value of ["", "0", "0x0", "-1", "1.1", "1e3"]) assert.throws(() => parseChainId(value));
});
test("wallet errors are understandable", () => {
    assert.match(errorMessage({code: 4001}), /cancelled/);
    assert.match(errorMessage({code: -32002}), /pending/);
    assert.match(errorMessage({code: 4900}), /disconnected/);
});
test("missing wallet blocks transactions", async () => {
    await assert.rejects(createClient({}, null, null).deposit("1"), /MetaMask was not detected/);
});
test("missing library blocks transactions", async () => {
    await assert.rejects(createClient({}, {request() {}}, null).deposit("1"), /Web3.js did not load/);
});
test("invalid contract settings do not request wallet permission", async () => {
    const f = fixture({address: "PASTE_ADDRESS"});
    await assert.rejects(f.client.deposit("1"), /contract/);
    assert.deepEqual(f.requests, []);
});
test("wrong network stops the call", async () => {
    const f = fixture({chainId: "1"});
    await assert.rejects(f.client.deposit("1"), /Wrong network/);
    assert.equal(f.calls.length, 0);
});
test("empty connected accounts fail clearly", async () => {
    const f = fixture(); f.setAccount(null);
    await assert.rejects(f.client.deposit("1"), /No wallet account/);
});
test("missing bytecode is detected for all empty forms", async () => {
    for (const code of ["0x", "0x0", "0x0000", ""]) {
        const f = fixture({code});
        await assert.rejects(f.client.deposit("1"), /Contract not found/);
        assert.equal(f.calls.length, 0);
    }
});
test("transfer always uses the connected wallet as payer", async () => {
    const f = fixture();
    assert.equal(await f.client.transfer(PAYEE, "9007199254740993"), "0xconfirmed");
    assert.deepEqual(f.calls[0], {name:"transfer",args:[ACCOUNT,PAYEE,"9007199254740993"],tx:{from:ACCOUNT}});
});
test("zero, malformed and self payees are rejected", async () => {
    for (const payee of [ZERO, "bad", ACCOUNT]) {
        const f = fixture();
        await assert.rejects(f.client.transfer(payee, "1"));
        assert.equal(f.calls.length, 0);
    }
});
test("deposit has no ETH value and uses the connected depositor", async () => {
    const f = fixture(); await f.client.deposit("100");
    assert.deepEqual(f.calls[0], {name:"depositMoney",args:[ACCOUNT,"100"],tx:{from:ACCOUNT}});
});
test("view is read only and does not request accounts", async () => {
    const f = fixture();
    assert.deepEqual(await f.client.viewDeposit(), {depositor:ACCOUNT,amount:"100"});
    assert.equal(f.requests.includes("eth_requestAccounts"), false);
    assert.equal(f.calls.length, 0);
});
test("account change during preflight prevents signing", async () => {
    const f = fixture({onCode: () => f.setAccount(PAYEE)});
    await assert.rejects(f.client.deposit("1"), /account changed/);
    assert.equal(f.calls.length, 0);
});
test("chain change during preflight prevents signing", async () => {
    const f = fixture({onCode: () => f.setChain("0x1")});
    await assert.rejects(f.client.deposit("1"), /Wrong network/);
    assert.equal(f.calls.length, 0);
});
test("wallet events invalidate in-flight reads", async () => {
    const f = fixture({onView: () => f.client.invalidate()});
    await assert.rejects(f.client.viewDeposit(), /Wallet or network changed/);
});
test("reverted receipts are not presented as success", async () => {
    const f = fixture({receipt: {status:false,transactionHash:"0xfailed"}});
    await assert.rejects(f.client.deposit("1"), /reverted/);
});
test("wallet rejection is propagated without a success result", async () => {
    const f = fixture({sendError: Object.assign(new Error("Denied"), {code:4001})});
    await assert.rejects(f.client.deposit("1"), {code:4001});
});
test("context changes after submission retain confirmed hash", async () => {
    const f = fixture({onSend: () => f.client.invalidate()});
    await assert.rejects(f.client.deposit("1"), /previous wallet context: 0xconfirmed/);
});
test("initial account permission event does not break connection", async () => {
    const f = fixture({request: method => {if (method === "eth_requestAccounts") f.client.invalidate();}});
    assert.equal(await f.client.connect(), ACCOUNT);
    assert.equal(await f.client.deposit("1"), "0xconfirmed");
});

