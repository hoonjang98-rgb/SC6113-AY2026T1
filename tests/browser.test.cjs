const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const {chromium} = require("playwright");

(async () => {
    const python = process.env.TEST_PYTHON || (process.platform === "win32"
        ? ".venv/Scripts/python.exe" : ".venv/bin/python");
    const server = spawn(python, ["tests/browser_server.py"], {stdio: ["ignore", "pipe", "pipe"]});
    let errors = "";
    server.stderr.on("data", chunk => { errors += chunk; });
    let browser, page;
    try {
        const url = await new Promise((resolve, reject) => {
            let data = "";
            const timer = setTimeout(() => reject(new Error("Test server timed out: " + errors)), 30000);
            server.on("error", error => {clearTimeout(timer); reject(error);});
            server.on("exit", code => {clearTimeout(timer); reject(new Error("Test server exited: " + code + errors));});
            server.stdout.on("data", chunk => {
                data += chunk;
                if (data.includes("\n")) {
                    clearTimeout(timer);
                    resolve(JSON.parse(data.split("\n")[0]).url);
                }
            });
        });
        browser = await chromium.launch({
            headless: true,
            ...(process.env.BROWSER_CHANNEL ? {channel: process.env.BROWSER_CHANNEL} : {})
        });
        const context = await browser.newContext();
        page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        const info = await fetch(url + "/__test_state").then(r => r.json());

        await page.goto(url + "/main");
        assert.equal(await page.locator("h1").innerText(), "Course DApp");
        await page.getByRole("link", {name:"Deposit Record", exact:true}).click();
        await page.waitForLoadState("load");
        await page.getByRole("button", {name:"View Latest Deposit"}).click();
        await page.waitForFunction(() => document.querySelector("#status").textContent.includes("MetaMask was not detected"));
        console.log("PASS navigation and missing wallet");

        // A test-only EIP-1193 provider forwards RPC to a real, isolated PyEVM.
        // No extension, public network, private user key or funds are involved.
        await context.addInitScript(({accounts, chainId}) => {
            const handlers = {};
            window.testWallet = {
                accounts: [accounts[0]], chainId, reject: false, delay: 0, sends: 0,
                emit(event) { for (const handler of handlers[event] || []) handler(); }
            };
            window.ethereum = {
                on(event, handler) { (handlers[event] ||= []).push(handler); },
                removeListener(event, handler) {
                    handlers[event] = (handlers[event] || []).filter(h => h !== handler);
                },
                async request({method, params = []}) {
                    if (method === "eth_requestAccounts" || method === "eth_accounts") return window.testWallet.accounts;
                    if (method === "eth_chainId") return window.testWallet.chainId;
                    if (method === "eth_sendTransaction") {
                        window.testWallet.sends += 1;
                        if (window.testWallet.delay) await new Promise(r => setTimeout(r, window.testWallet.delay));
                        if (window.testWallet.reject) throw Object.assign(new Error("User denied"), {code:4001});
                    }
                    const response = await fetch("/__test_rpc", {
                        method:"POST", headers:{"Content-Type":"application/json"},
                        body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})
                    }).then(r => r.json());
                    if (response.error) throw Object.assign(new Error(response.error.message), response.error);
                    return response.result;
                }
            };
        }, info);
        await page.reload();
        await page.waitForFunction(() => typeof Web3 === "function");
        await page.locator("#amount").fill("100");
        await page.getByRole("button", {name:"Save Deposit"}).click();
        await page.waitForFunction(() => /Deposit recorded|data-error/.test(document.querySelector("#status").textContent) || document.querySelector("#status").dataset.error === "true");
        assert.match(await page.locator("#status").innerText(), /Deposit recorded/, errors);
        await page.getByRole("button", {name:"View Latest Deposit"}).click();
        await page.waitForFunction(() => document.querySelector("#deposit-result").textContent.includes("Amount: 100"));
        console.log("PASS real Web3 ABI encoding, EVM deposit and read");

        await page.getByRole("link", {name:"Transfer",exact:true}).click();
        await page.waitForLoadState("load");
        await page.getByRole("button", {name:"Connect Wallet"}).click();
        await page.waitForFunction(() => document.querySelector("#payer").value !== "");
        assert.equal((await page.locator("#payer").inputValue()).toLowerCase(), info.accounts[0].toLowerCase());
        await page.locator("#payee").fill(info.accounts[1]);
        await page.locator("#amount").fill("30");
        await page.evaluate(() => {window.testWallet.delay = 600;});
        await page.getByRole("button", {name:"Transfer",exact:true}).click();
        assert.equal(await page.getByRole("button", {name:"Transfer",exact:true}).isDisabled(), true);
        await page.locator("#transfer-form").dispatchEvent("submit");
        await page.waitForFunction(() => document.querySelector("#status").textContent.includes("Transfer confirmed") || document.querySelector("#status").dataset.error === "true");
        assert.match(await page.locator("#status").innerText(), /Transfer confirmed/);
        assert.equal(await page.evaluate(() => window.testWallet.sends), 1);
        const balances = await fetch(url + "/__test_state").then(r => r.json());
        assert.deepEqual(balances.balances, ["70","30"]);
        console.log("PASS real EVM transfer, receipt and duplicate-submit prevention");

        await page.locator("#amount").fill("71");
        await page.getByRole("button", {name:"Transfer",exact:true}).click();
        await page.waitForFunction(() => document.querySelector("#status").dataset.error === "true");
        assert.doesNotMatch(await page.locator("#status").innerText(), /Transfer confirmed/);
        console.log("PASS insufficient balance shows failure");

        await page.evaluate(() => {window.testWallet.reject = true;});
        await page.locator("#amount").fill("1");
        await page.getByRole("button", {name:"Transfer",exact:true}).click();
        await page.waitForFunction(() => document.querySelector("#status").textContent.includes("cancelled"));
        assert.equal(await page.getByRole("button", {name:"Transfer",exact:true}).isDisabled(), false);
        console.log("PASS wallet rejection unlocks controls");

        await page.evaluate(() => {window.testWallet.chainId = "0x1";window.testWallet.emit("chainChanged");});
        assert.equal(await page.locator("#payer").inputValue(), "");
        await page.getByRole("button", {name:"Connect Wallet"}).click();
        await page.waitForFunction(() => document.querySelector("#status").textContent.includes("Wrong network"));
        console.log("PASS network change invalidates payer");

        await page.setViewportSize({width: 360,height:640});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await fs.mkdir("test-results", {recursive:true});
        await page.screenshot({path:"test-results/transfer-mobile.png",fullPage:true});
        await page.goto(url + "/");
        await page.screenshot({path:"test-results/main-mobile.png",fullPage:true});
        assert.deepEqual(pageErrors, []);
        console.log("PASS mobile layout and no uncaught JavaScript errors");
    } catch (error) {
        if (page) console.error("Browser diagnostic:", await page.locator("body").innerText());
        throw error;
    } finally {
        if (browser) await browser.close();
        server.kill();
    }
})().catch(error => {console.error(error);process.exitCode = 1;});
