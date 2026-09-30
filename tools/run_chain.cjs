const fs = require("node:fs");
const path = require("node:path");
const {spawn} = require("node:child_process");

const root = path.resolve(__dirname, "..");
fs.mkdirSync(path.join(root, ".cache"), {recursive:true});
const wrapper = path.join(path.dirname(require.resolve("@foundry-rs/anvil/package.json")), "bin.mjs");
const args = [
    "--host", "127.0.0.1", "--port", "8545", "--chain-id", "31337", "--hardfork", "prague",
    "--state", path.join(root, ".cache", "anvil-state.json"), "--state-interval", "10",
    "--allow-origin", "https://app.remix.live", "--quiet"
];
console.log("Course local chain: http://127.0.0.1:8545 (chain ID 31337). Keep this terminal open.");
const child = spawn(process.execPath, [wrapper, ...args], {cwd:root,stdio:"inherit",windowsHide:true});
child.on("error", error => {console.error(error.message);process.exitCode=1;});
child.on("exit", code => {process.exitCode=code ?? 0;});
for (const signal of ["SIGINT","SIGTERM"]) process.on(signal, () => child.kill(signal));

