const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('ethers');
const C = require('../static/core.js');
test('amount parsing uses exact wei and rejects unsafe or ambiguous input', () => {
  assert.equal(C.amountWei('0.000000000000000001'),1n);
  assert.equal(C.amountWei('1.234567890123456789'),1234567890123456789n);
  for (const value of ['0','-1','1e3','1.0000000000000000001','NaN','Infinity','1,000','01','', '9'.repeat(90)]) assert.throws(()=>C.amountWei(value));
});
test('wallet addresses, chain, and account changes are checked', () => {
  const address = '0x1111111111111111111111111111111111111111';
  assert.equal(C.walletAddress(` ${address} `),address);
  assert.throws(()=>C.walletAddress(E.ZeroAddress));
  assert.throws(()=>C.walletAddress('0x1234'));
  C.assertChain('0xaa36a7'); assert.throws(()=>C.assertChain(1));
  C.assertSameAccount(address,address); assert.throws(()=>C.assertSameAccount(null,address));
  assert.throws(()=>C.assertSameAccount(E.ZeroAddress,address));
});
test('contract code verification fails closed', () => {
  const address = '0x1111111111111111111111111111111111111111';
  C.ensureVault(address,'0x1234',E.keccak256('0x1234'));
  assert.throws(()=>C.ensureVault(address,'0x',E.keccak256('0x1234')));
  assert.throws(()=>C.ensureVault(address,'0x1235',E.keccak256('0x1234')));
});
test('wallet cancellation and insufficient balance have readable messages', () => {
  assert.match(C.errorMessage({code:4001}),/cancelled/);
  assert.match(C.errorMessage({code:'INSUFFICIENT_FUNDS'}),/gas/);
});
