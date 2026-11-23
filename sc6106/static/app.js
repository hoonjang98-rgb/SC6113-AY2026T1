/* Native Sepolia ETH only. Signing stays inside the user's wallet. */
(() => {
  'use strict';
  const E = window.ethers, C = window.SC6106;
  const $ = id => document.getElementById(id);
  const explorer = 'https://sepolia.etherscan.io';
  let busy = false, revision = 0, cancelReview = null, historyState = null;
  const metadata = Promise.all([
    fetch('/static/contracts/SepoliaStore.json').then(checkResponse),
    fetch('/static/deployment.json', {cache:'no-store'}).then(checkResponse)
  ]);
  // Handle a failed metadata request even on pages that do not need a contract.
  metadata.catch(() => {});
  async function checkResponse(response) {
    if (!response.ok) throw Error('Contract configuration is unavailable. Please reload.');
    return response.json();
  }
  function status(message, kind = '', hash = null) {
    const element = $('status');
    element.hidden = false; element.className = `status ${kind}`; element.textContent = message;
    if (hash) {
      const link = document.createElement('a'); link.href = `${explorer}/tx/${hash}`;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = ' View transaction';
      element.append(link);
    }
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    const controls = [...document.querySelectorAll('form input, form button, #transaction-button, #deploy-button, #more-history')];
    const disabled = controls.map(element => element.disabled);
    controls.forEach(element => { element.disabled = true; });
    try { await task(); }
    catch (error) { status(C.errorMessage(error), 'error'); }
    finally { controls.forEach((element,index) => {element.disabled = disabled[index];}); busy = false; }
  }
  function walletChanged() {
    revision++;
    cancelReview?.();
    status('Wallet account or network changed. Review the details before your next transaction.');
  }
  if (window.ethereum?.on) {
    window.ethereum.on('accountsChanged', walletChanged);
    window.ethereum.on('chainChanged', walletChanged);
  }
  async function wallet() {
    if (!window.ethereum?.request) throw Error('Open this site in a browser with MetaMask or another Ethereum wallet. Read-only history is available without a wallet.');
    status('Connect your wallet and select Ethereum Sepolia.');
    const accounts = await window.ethereum.request({method:'eth_requestAccounts'});
    if (!accounts.length) throw Error('No wallet account is connected.');
    C.assertChain(await window.ethereum.request({method:'eth_chainId'}));
    const provider = new E.BrowserProvider(window.ethereum, 'any');
    const signer = await provider.getSigner(accounts[0]);
    return {provider,signer,address:C.walletAddress(accounts[0]),revision};
  }
  async function unchanged(context) {
    if (context.revision !== revision) throw Error('Wallet context changed. Please review and try again.');
    C.assertChain(await window.ethereum.request({method:'eth_chainId'}));
    const accounts = await window.ethereum.request({method:'eth_accounts'});
    C.assertSameAccount(accounts[0], context.address);
  }
  async function readProvider() {
    const providers = ['https://ethereum-sepolia-rpc.publicnode.com','https://sepolia.drpc.org'].map(url =>
      new E.JsonRpcProvider(url, Number(C.CHAIN_ID), {staticNetwork:true,batchMaxCount:1}));
    return new E.FallbackProvider(providers.map((provider,index) => ({provider,priority:index+1,weight:1,stallTimeout:1800})), Number(C.CHAIN_ID), {quorum:1});
  }
  async function vault(provider) {
    const [artifact, config] = await metadata;
    if (config.chainId !== Number(C.CHAIN_ID) || !config.address) throw Error('The Store contract has not been deployed yet. Please complete contract setup first.');
    const address = C.walletAddress(config.address);
    C.ensureVault(address, await provider.getCode(address), artifact.runtimeCodeHash);
    return new E.Contract(address, artifact.abi, provider);
  }
  function review(title, details) {
    $('review-title').textContent = title;
    $('review-details').textContent = details;
    const dialog = $('review-dialog');
    return new Promise(resolve => {
      const finish = value => {
        dialog.close(); cancelReview = null;
        $('cancel-review').onclick = null; $('confirm-review').onclick = null; dialog.oncancel = null;
        resolve(value);
      };
      cancelReview = () => finish(false);
      $('cancel-review').onclick = () => finish(false);
      $('confirm-review').onclick = () => finish(true);
      dialog.oncancel = event => {event.preventDefault(); finish(false);};
      dialog.showModal();
    });
  }
  async function confirm(context, title, details) {
    if (!await review(title, details)) {status('Transaction cancelled. Nothing was sent.'); return false;}
    await unchanged(context);
    return true;
  }
  async function waitConfirmed(transaction) {
    status('Transaction submitted. Waiting for confirmation…', '', transaction.hash);
    let receipt;
    try { receipt = await transaction.wait(1); }
    catch (error) {
      if (error.code !== 'TRANSACTION_REPLACED' || error.cancelled || error.reason !== 'repriced') throw error;
      receipt = error.receipt;
    }
    if (!receipt || receipt.status !== 1) throw Error('The transaction did not succeed. Check it in the explorer.');
    status('Transaction confirmed on Ethereum Sepolia.', 'success', receipt.hash);
    return receipt;
  }
  async function afford(context, request) {
    const gas = await context.signer.estimateGas(request);
    const fees = await context.provider.getFeeData();
    const cost = (request.value || 0n) + gas * (fees.maxFeePerGas || fees.gasPrice || 0n);
    if (await context.provider.getBalance(context.address) < cost) throw Error('Your wallet needs enough Sepolia ETH for the amount and gas fee.');
  }
  $('store-form')?.addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      const beneficiary = C.walletAddress($('wallet').value), amount = C.amountWei($('amount').value);
      const context = await wallet(), contract = await vault(context.provider);
      if (beneficiary.toLowerCase() === contract.target.toLowerCase()) throw Error('Enter a wallet address, not the Store contract address.');
      const request = await contract.store.populateTransaction(beneficiary, {value:amount});
      await afford(context, request);
      if (!await confirm(context, 'Store Sepolia ETH', `From: ${context.address}\nBeneficiary: ${beneficiary}\nAmount: ${E.formatEther(amount)} Sepolia ETH\nContract: ${contract.target}\n\nOnly the beneficiary can withdraw this deposit. Check this address carefully.`)) return;
      await waitConfirmed(await context.signer.sendTransaction({...request,chainId:C.CHAIN_ID}));
      $('amount').value = '';
    });
  });
  $('transfer-form')?.addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      const to = C.walletAddress($('wallet').value), value = C.amountWei($('amount').value);
      const context = await wallet(), request = {to,value};
      await afford(context, request);
      if (!await confirm(context, 'Transfer Sepolia ETH', `From: ${context.address}\nTo: ${to}\nAmount: ${E.formatEther(value)} Sepolia ETH\n\nThis sends ETH directly to the recipient.`)) return;
      await waitConfirmed(await context.signer.sendTransaction({...request,chainId:C.CHAIN_ID}));
      $('amount').value = '';
    });
  });
  $('transaction-button')?.addEventListener('click', () => {
    try {location.href = `/transactions#wallet=${encodeURIComponent(C.walletAddress($('wallet').value))}`;}
    catch(error) {status(C.errorMessage(error), 'error');}
  });
  async function lookup() {
    historyState = null;
    $('balance-panel').hidden = true; $('history-panel').hidden = true;
    const address = C.walletAddress($('wallet').value);
    status('Reading stored balance and transactions from Sepolia…');
    const provider = await readProvider(), contract = await vault(provider);
    const blockTag = await provider.getBlockNumber();
    const balance = await contract.balanceOf(address, {blockTag});
    historyState = {address,contract,balance,offset:0,blockTag};
    $('stored-balance').textContent = `${E.formatEther(balance)} ETH`;
    $('vault-link').href = `${explorer}/address/${contract.target}`;
    $('balance-panel').hidden = false; $('history-panel').hidden = false;
    $('history-list').replaceChildren();
    await moreHistory();
    status('Sepolia Store history loaded.', 'success');
  }
  async function moreHistory() {
    const state = historyState;
    if (!state) return;
    const [records,total] = await state.contract.transactions(state.address,state.offset,25,{blockTag:state.blockTag});
    for (const record of records) {
      const row = document.createElement('article'); row.className = 'history-record';
      const title = document.createElement('strong'); title.textContent = `${record.kind === 0n ? 'Stored' : 'Withdrawn'} ${E.formatEther(record.amount)} ETH`;
      const details = document.createElement('p'); details.textContent = `${new Date(Number(record.timestamp)*1000).toLocaleString()} · ${record.kind === 0n ? 'From' : 'To'} ${record.actor}`;
      const link = document.createElement('a'); link.href = `${explorer}/block/${record.blockNumber}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = `Block ${record.blockNumber}`;
      row.append(title,details,link); $('history-list').append(row);
    }
    state.offset += records.length;
    $('history-count').textContent = total === 0n ? 'No Store transactions for this wallet.' : `Showing ${state.offset} of ${total} transactions`;
    $('more-history').hidden = BigInt(state.offset) >= total;
  }
  $('lookup-form')?.addEventListener('submit', event => {event.preventDefault(); run(lookup);});
  $('more-history')?.addEventListener('click', () => run(moreHistory));
  $('withdraw-form')?.addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      if (!historyState) throw Error('Look up your wallet first.');
      const amount = C.amountWei($('withdraw-amount').value), owner = historyState.address;
      const context = await wallet(); C.assertSameAccount(context.address,owner);
      const contract = await vault(context.provider);
      if (amount > await contract.balanceOf(owner)) throw Error('The amount exceeds your stored balance.');
      const request = await contract.withdraw.populateTransaction(amount);
      await afford(context,request);
      if (!await confirm(context,'Withdraw Sepolia ETH',`To your wallet: ${owner}\nAmount: ${E.formatEther(amount)} Sepolia ETH\nContract: ${contract.target}`)) return;
      const receipt = await waitConfirmed(await context.signer.sendTransaction({...request,chainId:C.CHAIN_ID}));
      $('withdraw-amount').value = '';
      try {await lookup();} catch { /* Preserve the confirmed receipt if read-only RPC is delayed. */ }
      status('Withdrawal confirmed. Use View transactions to refresh the latest balance.', 'success', receipt.hash);
    });
  });
  $('deploy-button')?.addEventListener('click', () => run(async () => {
    const [artifact,config] = await metadata;
    if (config.address) throw Error('A Store contract is already configured. No new deployment is needed.');
    const context = await wallet(), factory = new E.ContractFactory(artifact.abi,artifact.bytecode,context.signer);
    const request = await factory.getDeployTransaction();
    await afford(context,request);
    if (!await confirm(context,'Deploy Store contract',`Network: Ethereum Sepolia\nDeployer: ${context.address}\nContract: SepoliaStore\nValue sent: 0 ETH (gas fee only)\nRuntime code hash: ${artifact.runtimeCodeHash}`)) return;
    const contract = await factory.deploy({chainId:C.CHAIN_ID});
    const receipt = await waitConfirmed(contract.deploymentTransaction());
    const address = await contract.getAddress();
    C.ensureVault(address,await context.provider.getCode(address),artifact.runtimeCodeHash);
    const result = {chainId:Number(C.CHAIN_ID),address,blockNumber:receipt.blockNumber,transactionHash:receipt.hash};
    $('deployment-output').textContent = JSON.stringify(result,null,2);
    $('deployment-result').hidden = false;
    status('Contract deployed and code verified. Save the deployment details so the site can be connected to this contract.', 'success',receipt.hash);
  }));
  if (document.body.dataset.page === 'transactions') {
    // Fragments stay in the browser and are not sent to Render access logs.
    const address = new URLSearchParams(location.hash.slice(1)).get('wallet');
    if (location.hash) history.replaceState(null, '', location.pathname);
    if (address) {$('wallet').value = address; run(lookup);}
  }
  if (document.body.dataset.page === 'setup') metadata.then(([,config]) => {
    if (config.address) {$('deploy-button').disabled = true; status(`Store is configured at ${config.address}.`,'success');}
  }).catch(error => status(C.errorMessage(error),'error'));
})();
