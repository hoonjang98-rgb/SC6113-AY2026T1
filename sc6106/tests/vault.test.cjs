const test = require('node:test');
const assert = require('node:assert/strict');
const ganache = require('ganache');
const E = require('ethers');
const solc = require('solc');
const artifact = require('../static/contracts/SepoliaStore.json');
test('native ETH vault: balances, access control, history, rollback, and reentrancy', async t => {
  const rpc = ganache.provider({logging:{quiet:true},chain:{chainId:11155111,hardfork:'shanghai'},wallet:{deterministic:true,totalAccounts:4}});
  t.after(()=>rpc.disconnect());
  const provider = new E.BrowserProvider(rpc); provider.pollingInterval = 10;
  const [alice,bob,outsider] = await Promise.all([0,1,2].map(i=>provider.getSigner(i)));
  const a = await alice.getAddress(), b = await bob.getAddress();
  const vault = await new E.ContractFactory(artifact.abi,artifact.bytecode,alice).deploy(); await vault.waitForDeployment();
  const address = await vault.getAddress();
  const send = async promise => (await promise).wait();
  const rejects = async promise => assert.rejects(async()=>send(promise));
  await t.test('deposit credits the beneficiary and receives real native ETH', async()=>{
    await send(vault.store(b,{value:E.parseEther('2')}));
    assert.equal(await vault.balanceOf(b),E.parseEther('2'));
    assert.equal(await vault.balanceOf(a),0n);
    assert.equal(BigInt(await rpc.request({method:'eth_getBalance',params:[address,'latest']})),E.parseEther('2'));
    assert.equal(await vault.totalStored(),E.parseEther('2'));
  });
  await t.test('only the beneficiary can withdraw; invalid deposits and direct transfers revert',async()=>{
    await rejects(vault.connect(outsider).withdraw(1n));
    await rejects(vault.withdraw(1n));
    await rejects(vault.store(b));
    await rejects(vault.store(E.ZeroAddress,{value:1n}));
    await rejects(vault.store(address,{value:1n}));
    await rejects(alice.sendTransaction({to:address,value:1n}));
    await rejects(vault.connect(bob).withdraw(0n));
    await rejects(vault.connect(bob).withdraw(E.parseEther('3')));
  });
  await t.test('withdrawal pays the owner and preserves accounting and newest-first history', async()=>{
    const before = BigInt(await rpc.request({method:'eth_getBalance',params:[b,'latest']}));
    const receipt = await send(vault.connect(bob).withdraw(E.parseEther('0.5')));
    const after = BigInt(await rpc.request({method:'eth_getBalance',params:[b,'latest']}));
    assert.equal(after + receipt.fee - before,E.parseEther('0.5'));
    assert.equal(await vault.balanceOf(b),E.parseEther('1.5'));
    assert.equal(await vault.totalStored(),E.parseEther('1.5'));
    const [rows,total] = await vault.transactions(b,0,25);
    assert.equal(total,2n); assert.equal(rows[0].kind,1n); assert.equal(rows[1].actor,a);
    assert.equal(rows[0].amount,E.parseEther('0.5')); assert.ok(rows[0].blockNumber > rows[1].blockNumber);
  });
  const source = `pragma solidity 0.8.30;
  interface IV {function store(address) external payable; function withdraw(uint256) external;}
  contract Probe {IV public v; bool public reject; bool public tried; bool public reentered;
    constructor(address target){v=IV(target);} function setReject(bool x) external {reject=x;}
    function deposit() external payable {v.store{value:msg.value}(address(this));}
    function take(uint256 x) external {v.withdraw(x);}
    receive() external payable {if(reject) revert(); tried=true; (reentered,)=address(v).call(abi.encodeWithSignature("withdraw(uint256)",1));}}
  `;
  const out = JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Probe.sol':{content:source}},settings:{evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
  const p = out.contracts['Probe.sol'].Probe;
  const probe = await new E.ContractFactory(p.abi,'0x'+p.evm.bytecode.object,alice).deploy(address); await probe.waitForDeployment();
  const probeAddress = await probe.getAddress();
  await t.test('failed recipient payment rolls back balances and history',async()=>{
    await send(probe.deposit({value:100n})); await send(probe.setReject(true));
    await rejects(probe.take(10n));
    assert.equal(await vault.balanceOf(probeAddress),100n);
    assert.equal((await vault.transactions(probeAddress,0,25))[1],1n);
  });
  await t.test('reentrant withdrawal is blocked while the legitimate withdrawal succeeds',async()=>{
    await send(probe.setReject(false)); await send(probe.take(10n,{gasLimit:300000}));
    assert.equal(await probe.tried(),true); assert.equal(await probe.reentered(),false);
    assert.equal(await vault.balanceOf(probeAddress),90n);
    assert.equal(await vault.totalStored(),E.parseEther('1.5')+90n);
  });
  await t.test('history reads are bounded and paginated',async()=>{
    for(let i=0;i<26;i++) await send(vault.store(a,{value:1n}));
    const [first,total] = await vault.transactions(a,0,1000);
    assert.equal(first.length,25); assert.equal(total,26n);
    assert.equal((await vault.transactions(a,25,25))[0].length,1);
    assert.equal((await vault.transactions(a,26,25))[0].length,0);
    assert.equal((await vault.transactions(a,0,0))[0].length,0);
  });
});
