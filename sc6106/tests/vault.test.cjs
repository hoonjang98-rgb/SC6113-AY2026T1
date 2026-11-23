const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('ethers');
const solc = require('solc');
const artifact = require('../static/contracts/SepoliaStore.json');
const {createVM} = require('@ethereumjs/vm');
const {createCustomCommon,Mainnet,Hardfork} = require('@ethereumjs/common');
const {createAccount,createAddressFromString,hexToBytes,bytesToHex} = require('@ethereumjs/util');
const {createBlock} = require('@ethereumjs/block');

// Isolated in-memory EVM. No RPC listener, real wallet, signing key, or network.
async function harness(chainId=11155111) {
  const common=createCustomCommon({chainId},Mainnet,{hardfork:Hardfork.Shanghai});
  const vm=await createVM({common});
  const alice=createAddressFromString('0x1111111111111111111111111111111111111111');
  const bob=createAddressFromString('0x2222222222222222222222222222222222222222');
  const outsider=createAddressFromString('0x3333333333333333333333333333333333333333');
  for(const address of [alice,bob,outsider]) await vm.stateManager.putAccount(address,createAccount({balance:E.parseEther('100')}));
  let height=0n;
  async function execute({caller=alice,to,data='0x',value=0n,isStatic=false}) {
    height++;
    const block=createBlock({header:{number:height,timestamp:1800000000n+height,gasLimit:30000000n}},{common});
    return vm.evm.runCall({caller,to,data:hexToBytes(data),value,isStatic,gasLimit:5000000n,block});
  }
  async function deploy(bytecode=artifact.bytecode) {
    const result=await execute({data:bytecode});
    assert.equal(result.execResult.exceptionError,undefined,'deployment must succeed');
    return result.createdAddress;
  }
  function contract(address,abi=artifact.abi) {
    const iface=new E.Interface(abi);
    return {
      address,
      async send(method,args=[],value=0n,caller=alice) {
        const result=await execute({to:address,caller,data:iface.encodeFunctionData(method,args),value});
        if(result.execResult.exceptionError) throw Error(result.execResult.exceptionError.error);
        return result;
      },
      async read(method,args=[]) {
        const result=await execute({to:address,data:iface.encodeFunctionData(method,args),isStatic:true});
        assert.equal(result.execResult.exceptionError,undefined);
        return iface.decodeFunctionResult(method,bytesToHex(result.execResult.returnValue));
      }
    };
  }
  const balance=async address => (await vm.stateManager.getAccount(address))?.balance||0n;
  return {vm,alice,bob,outsider,execute,deploy,contract,balance};
}

test('Store deployment rejects mainnet',async()=>{
  const h=await harness(1), result=await h.execute({data:artifact.bytecode});
  assert.ok(result.execResult.exceptionError);
  assert.equal(new E.Interface(artifact.abi).parseError(bytesToHex(result.execResult.returnValue)).name,'WrongNetwork');
});

test('native ETH vault security and accounting',async t=>{
  const h=await harness(), address=await h.deploy(), vault=h.contract(address);
  const a=h.alice.toString(),b=h.bob.toString();
  await t.test('native ETH is credited to the entered beneficiary only',async()=>{
    await vault.send('store',[b],E.parseEther('2'));
    assert.equal((await vault.read('balanceOf',[b]))[0],E.parseEther('2'));
    assert.equal((await vault.read('balanceOf',[a]))[0],0n);
    assert.equal(await h.balance(address),E.parseEther('2'));
    assert.equal((await vault.read('totalStored'))[0],E.parseEther('2'));
  });
  await t.test('unauthorized, zero, excessive, and direct transfers revert',async()=>{
    await assert.rejects(vault.send('withdraw',[1n],0n,h.outsider));
    await assert.rejects(vault.send('withdraw',[1n]));
    await assert.rejects(vault.send('store',[b]));
    await assert.rejects(vault.send('store',[E.ZeroAddress],1n));
    await assert.rejects(vault.send('store',[address.toString()],1n));
    assert.ok((await h.execute({to:address,value:1n})).execResult.exceptionError);
    await assert.rejects(vault.send('withdraw',[0n],0n,h.bob));
    await assert.rejects(vault.send('withdraw',[E.parseEther('3')],0n,h.bob));
  });
  await t.test('withdrawal pays the owner and records newest-first history',async()=>{
    const before=await h.balance(h.bob);
    await vault.send('withdraw',[E.parseEther('0.5')],0n,h.bob);
    assert.equal(await h.balance(h.bob)-before,E.parseEther('0.5'));
    assert.equal((await vault.read('balanceOf',[b]))[0],E.parseEther('1.5'));
    assert.equal((await vault.read('totalStored'))[0],E.parseEther('1.5'));
    const [rows,total]=await vault.read('transactions',[b,0,25]);
    assert.equal(total,2n); assert.equal(rows[0].kind,1n); assert.equal(rows[1].actor,a);
    assert.equal(rows[0].amount,E.parseEther('0.5')); assert.ok(rows[0].blockNumber>rows[1].blockNumber);
  });
  const source=`pragma solidity 0.8.39;
    interface IV {function store(address) external payable; function withdraw(uint256) external;}
    contract Probe {IV public v; bool public reject; bool public tried; bool public reentered;
    constructor(address target){v=IV(target);} function setReject(bool x) external {reject=x;}
    function deposit() external payable {v.store{value:msg.value}(address(this));}
    function take(uint256 x) external {v.withdraw(x);}
    receive() external payable {if(reject) revert(); tried=true; (reentered,)=address(v).call(abi.encodeWithSignature("withdraw(uint256)",1));}}
  `;
  const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Probe.sol':{content:source}},settings:{evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
  const p=out.contracts['Probe.sol'].Probe;
  const data='0x'+p.evm.bytecode.object+E.AbiCoder.defaultAbiCoder().encode(['address'],[address.toString()]).slice(2);
  const probe=h.contract(await h.deploy(data),p.abi),probeAddress=probe.address.toString();
  await t.test('failed recipient payment rolls back balances and history',async()=>{
    await probe.send('deposit',[],100n); await probe.send('setReject',[true]);
    await assert.rejects(probe.send('take',[10n]));
    assert.equal((await vault.read('balanceOf',[probeAddress]))[0],100n);
    assert.equal((await vault.read('transactions',[probeAddress,0,25]))[1],1n);
  });
  await t.test('reentrant withdrawal is blocked and legitimate withdrawal succeeds',async()=>{
    await probe.send('setReject',[false]); await probe.send('take',[10n]);
    assert.equal((await probe.read('tried'))[0],true); assert.equal((await probe.read('reentered'))[0],false);
    assert.equal((await vault.read('balanceOf',[probeAddress]))[0],90n);
    assert.equal((await vault.read('totalStored'))[0],E.parseEther('1.5')+90n);
  });
  await t.test('history is bounded and paginated',async()=>{
    for(let i=0;i<26;i++) await vault.send('store',[a],1n);
    const [first,total]=await vault.read('transactions',[a,0,1000]);
    assert.equal(first.length,25); assert.equal(total,26n);
    assert.equal((await vault.read('transactions',[a,25,25]))[0].length,1);
    assert.equal((await vault.read('transactions',[a,26,25]))[0].length,0);
    assert.equal((await vault.read('transactions',[a,0,0]))[0].length,0);
    assert.equal(await h.balance(address),(await vault.read('totalStored'))[0]);
  });
});
