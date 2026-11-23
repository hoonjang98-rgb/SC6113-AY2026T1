import { preparePayment, SEPOLIA } from './payment.js';

const byId = (id) => document.getElementById(id);
const dialog = document.querySelector('dialog');
const form = byId('payment');
const controls = ['transfer', 'store', 'exit', 'cancel', 'review'].map(byId);
const walletErrors = {
  4001: 'Request cancelled in MetaMask.',
  4100: 'MetaMask access changed. Connect again to continue.',
  4900: 'MetaMask is offline. Check your connection.',
  4902: 'Enable Sepolia in MetaMask, then try again.',
  '-32002': 'A MetaMask request is already open. Check your wallet.'
};

let wallet;
let account;
let accountVersion = 0;
let networkVersion = 0;
let saving = false;
let busy = false;
let transactionHash;

function message(id, text = '', kind = 'error') {
  const element = byId(id);
  element.textContent = text;
  element.dataset.kind = kind;
  element.hidden = !text;
}

function describeError(error) {
  return walletErrors[Number(error?.code)] ?? error?.message ?? 'The wallet request failed.';
}

function showAccount(address) {
  account = address;
  const label = byId('account');
  label.textContent = address ? `MetaMask · ${address.slice(0, 8)}…${address.slice(-4)}` : 'MetaMask disconnected';
  label.title = address ?? '';
}

function registerWallet(candidate) {
  if (wallet || typeof candidate?.request !== 'function') return;
  wallet = candidate;
  byId('install').hidden = true;
  wallet.on?.('accountsChanged', ([current]) => {
    accountVersion++;
    if (!account || current?.toLowerCase() === account.toLowerCase()) return;
    showAccount(undefined);
    if (dialog.open) dialog.close();
    message('notice', 'Your wallet account changed. Choose an action to reconnect.', 'info');
  });
  wallet.on?.('chainChanged', () => {
    networkVersion++;
    if (!dialog.open) return;
    dialog.close();
    message('notice', 'The network changed. Open the form again to continue.', 'info');
  });
  wallet.on?.('disconnect', () => {
    accountVersion++;
    showAccount(undefined);
    if (dialog.open) dialog.close();
    message('notice', 'Disconnected from MetaMask.', 'info');
  });
}

window.addEventListener('eip6963:announceProvider', ({ detail }) => {
  if (detail?.info?.rdns === 'io.metamask') registerWallet(detail.provider);
});
window.dispatchEvent(new Event('eip6963:requestProvider'));

function request(method, params) {
  const injected = window.ethereum;
  if (!wallet && injected?.isMetaMask && !injected.providers?.length) registerWallet(injected);
  if (!wallet) {
    byId('install').hidden = false;
    throw new Error('Open this page in a browser with MetaMask enabled.');
  }
  return wallet.request(params ? { method, params } : { method });
}

async function run(action) {
  if (busy) return;
  busy = true;
  controls.forEach((button) => { button.disabled = true; });
  try {
    await action();
  } catch (error) {
    message(dialog.open ? 'payment-error' : 'notice', describeError(error));
  } finally {
    controls.forEach((button) => { button.disabled = false; });
    busy = false;
  }
}

async function openPayment(useSavings) {
  message('notice');
  const [approved] = await request('eth_requestAccounts');
  if (!approved) throw new Error('Select an account in MetaMask.');
  if (await request('eth_chainId') !== SEPOLIA) {
    await request('wallet_switchEthereumChain', [{ chainId: SEPOLIA }]);
  }
  const networkRevision = networkVersion;
  const accountRevision = accountVersion;
  if (await request('eth_chainId') !== SEPOLIA) throw new Error('Select Sepolia in MetaMask.');
  const [current] = await request('eth_accounts');
  if (current?.toLowerCase() !== approved.toLowerCase() ||
      networkRevision !== networkVersion || accountRevision !== accountVersion) {
    throw new Error('Your wallet session changed. Choose the action again.');
  }
  showAccount(current);
  saving = useSavings;
  form.reset();
  message('payment-error');
  byId('payment-title').textContent = saving ? 'Store Money' : 'Transfer Money';
  byId('payment-description').textContent = saving
    ? 'The ETH goes directly to your savings wallet. Use a separate address you control.'
    : 'Enter the recipient and amount, then verify both in MetaMask.';
  byId('recipient-label').textContent = saving ? 'Savings wallet address' : 'Recipient address';
  dialog.showModal();
}

async function disconnect() {
  message('notice');
  const accounts = await request('eth_accounts');
  showAccount(undefined);
  if (accounts.length > 0) {
    try {
      await request('wallet_revokePermissions', [{ eth_accounts: {} }]);
    } catch (error) {
      throw new Error(`To remove this site's permission, disconnect it in MetaMask. ${describeError(error)}`);
    }
  }
  message('notice', 'Disconnected from MetaMask.', 'info');
}

async function trackReceipt(hash) {
  const status = byId('transaction-status');
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (transactionHash !== hash) return;
    try {
      if (await request('eth_chainId') !== SEPOLIA) break;
      const receipt = await request('eth_getTransactionReceipt', [hash]);
      if (transactionHash !== hash) return;
      if (receipt?.status === '0x1' || receipt?.status === '0x0') {
        status.textContent = receipt.status === '0x1' ? 'Transaction confirmed.' : 'Transaction failed on-chain.';
        return;
      }
    } catch {
      // A temporary wallet error does not invalidate the explorer link.
    }
  }
  if (transactionHash === hash) status.textContent = 'Transaction submitted. Check Etherscan for its status.';
}

async function sendPayment() {
  message('payment-error');
  const from = account;
  const accountRevision = accountVersion;
  const networkRevision = networkVersion;
  const details = preparePayment(byId('recipient').value, byId('amount').value, saving ? from : undefined);
  if (await request('eth_chainId') !== SEPOLIA) throw new Error('Switch to Sepolia and reopen the form.');
  const [current] = await request('eth_accounts');
  if (!dialog.open || !from || current?.toLowerCase() !== from.toLowerCase() ||
      accountRevision !== accountVersion || networkRevision !== networkVersion) {
    throw new Error('Your wallet session changed. Open the form again.');
  }
  const hash = await request('eth_sendTransaction', [{ from, ...details, chainId: SEPOLIA }]);
  if (!/^0x[0-9a-f]{64}$/i.test(hash ?? '')) throw new Error('MetaMask returned an invalid transaction ID.');
  transactionHash = hash;
  if (dialog.open) dialog.close();
  message('notice');
  byId('explorer').href = `https://sepolia.etherscan.io/tx/${hash}`;
  byId('transaction-status').textContent = 'Transaction submitted.';
  byId('transaction').hidden = false;
  void trackReceipt(hash);
}

byId('transfer').addEventListener('click', () => void run(() => openPayment(false)));
byId('store').addEventListener('click', () => void run(() => openPayment(true)));
byId('exit').addEventListener('click', () => void run(disconnect));
byId('cancel').addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
form.addEventListener('submit', (event) => {
  event.preventDefault();
  void run(sendPayment);
});
