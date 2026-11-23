const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm'), E=require('ethers');
const C=require('../static/core.js');
const source=fs.readFileSync(require.resolve('../static/app.js'),'utf8');
const account='0x1111111111111111111111111111111111111111';
const recipient='0x2222222222222222222222222222222222222222';
function fixture(options={}) {
  const elements={},events={},sent=[],requests=[];
  function element(id) {return elements[id]??={value:'',disabled:false,hidden:false,textContent:'',className:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},append(){},close(){}};}
  for(const id of ['transfer-form','wallet','amount','status','review-dialog','review-title','review-details','cancel-review','confirm-review']) element(id);
  element('wallet').value=options.recipient??recipient; element('amount').value=options.amount??'0.01';
  let chain=options.chain??'0xaa36a7';
  const ethereum={on(name,fn){events[name]=fn;},async request({method}){
    requests.push(method);
    if(method==='eth_chainId') return chain;
    if(method==='eth_requestAccounts'&&options.rejectConnection) throw {code:4001};
    return [account];
  }};
  const signer={async estimateGas(){return 21000n;},async sendTransaction(request){sent.push(request);return {hash:'0x'+'a'.repeat(64),async wait(){return {status:1,hash:'0x'+'a'.repeat(64)};}};}};
  class Provider {async getSigner(){return signer;} async getFeeData(){return {maxFeePerGas:1n};} async getBalance(){return options.balance??E.parseEther('1');}}
  const document={body:{dataset:{page:'transfer'}},getElementById(id){return elements[id]||null;},querySelectorAll(){return [element('wallet'),element('amount')];},createElement(){return {}}};
  element('review-dialog').showModal=()=>queueMicrotask(()=>{
    if(options.changeAccount) events.accountsChanged(['0x3333333333333333333333333333333333333333']);
    else {if(options.changeChain) chain='0x1'; element(options.cancel?'cancel-review':'confirm-review').onclick();}
  });
  const context={window:{ethers:{...E,BrowserProvider:Provider},SC6106:C,...(!options.noWallet&&{ethereum})},document,location:{},URLSearchParams,queueMicrotask,fetch:async()=>({ok:true,json:async()=>({})})};
  vm.runInNewContext(source,context);
  async function submit(twice=false) {
    element('transfer-form').listeners.submit({preventDefault(){}});
    if(twice) element('transfer-form').listeners.submit({preventDefault(){}});
    for(let i=0;i<30;i++) await new Promise(resolve=>setImmediate(resolve));
  }
  return {submit,sent,requests,elements};
}
test('invalid destination is rejected before requesting wallet access',async()=>{
  const f=fixture({recipient:'<script>alert(1)</script>'}); await f.submit();
  assert.equal(f.requests.length,0); assert.equal(f.sent.length,0); assert.match(f.elements.status.textContent,/valid wallet/);
});
test('wrong network and unavailable wallet cannot submit a transaction',async()=>{
  for(const options of [{chain:'0x1'},{noWallet:true}]){const f=fixture(options);await f.submit();assert.equal(f.sent.length,0);assert.equal(f.elements.wallet.disabled,false);}
});
test('review cancellation and rejected connection send nothing',async()=>{
  for(const options of [{cancel:true},{rejectConnection:true}]){const f=fixture(options);await f.submit();assert.equal(f.sent.length,0);assert.match(f.elements.status.textContent,/cancelled/);}
});
test('account or chain change during review invalidates the transaction',async()=>{
  for(const options of [{changeAccount:true},{changeChain:true}]){const f=fixture(options);await f.submit();assert.equal(f.sent.length,0);}
});
test('insufficient balance prevents signing',async()=>{
  const f=fixture({balance:0n});await f.submit();assert.equal(f.sent.length,0);assert.match(f.elements.status.textContent,/gas fee/);
});
test('double submit sends one exact native-ETH transfer bound to Sepolia',async()=>{
  const f=fixture();await f.submit(true);assert.equal(f.sent.length,1);
  assert.equal(f.sent[0].to,recipient);assert.equal(f.sent[0].value,E.parseEther('0.01'));assert.equal(f.sent[0].chainId,11155111n);
  assert.match(f.elements.status.textContent,/confirmed/);assert.equal(f.elements.wallet.disabled,false);
});
