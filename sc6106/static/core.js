(function(root) {
  'use strict';
  const E = typeof module === 'object' && module.exports ? require('ethers') : root.ethers;
  const CHAIN_ID = 11155111n;
  function walletAddress(value) {
    let address;
    try { address = E.getAddress(String(value).trim()); } catch { throw Error('Enter a valid wallet address.'); }
    if (address === E.ZeroAddress) throw Error('The zero address cannot own stored ETH.');
    return address;
  }
  function amountWei(value) {
    const text = String(value).trim();
    if (text.length > 80) throw Error('The amount is too large.');
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(text)) throw Error('Enter an ETH amount with up to 18 decimal places.');
    let result;
    try { result = E.parseEther(text); } catch { throw Error('The amount is too large.'); }
    if (result <= 0n || result > E.MaxUint256) throw Error('Enter an ETH amount greater than zero and within range.');
    return result;
  }
  function errorMessage(error) {
    const code = error?.code ?? error?.info?.error?.code;
    if (code === 4001 || code === 'ACTION_REJECTED') return 'Request cancelled in your wallet.';
    if (code === -32002) return 'A wallet request is already open. Check your wallet.';
    if (code === 'INSUFFICIENT_FUNDS') return 'Your wallet needs enough Sepolia ETH for the amount and gas fee.';
    return error?.shortMessage || error?.message || 'The request failed. Please try again.';
  }
  function assertChain(chain) {
    if (BigInt(chain) !== CHAIN_ID) throw Error('Switch your wallet to Ethereum Sepolia (chain ID 11155111), then try again.');
  }
  function assertSameAccount(actual, expected) {
    if (!actual || actual.toLowerCase() !== expected.toLowerCase()) throw Error('Wallet account changed. Review the details and try again.');
  }
  function ensureVault(address, bytecode, expectedHash) {
    walletAddress(address);
    if (!bytecode || bytecode === '0x' || E.keccak256(bytecode) !== expectedHash) throw Error('The Store contract could not be verified on Sepolia. No transaction was sent.');
  }
  const api = {CHAIN_ID,walletAddress,amountWei,errorMessage,assertChain,assertSameAccount,ensureVault};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SC6106 = api;
})(typeof window === 'object' ? window : globalThis);
