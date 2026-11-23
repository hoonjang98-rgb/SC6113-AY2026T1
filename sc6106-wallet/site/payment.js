export const SEPOLIA = '0xaa36a7';

export function preparePayment(recipient, amount, savingsFrom) {
  const to = recipient.trim();
  if (!/^0x[0-9a-f]{40}$/i.test(to) || /^0x0{40}$/i.test(to)) {
    throw new Error('Enter a valid Ethereum address.');
  }
  if (to.toLowerCase() === savingsFrom?.toLowerCase()) {
    throw new Error('Enter a separate savings wallet address you control.');
  }
  const decimal = amount.trim();
  if (!/^(?:[0-9]{1,12}(?:\.[0-9]{0,18})?|\.[0-9]{1,18})$/.test(decimal)) {
    throw new Error('Enter an ETH amount with up to 18 decimal places.');
  }
  const [whole, fractional = ''] = decimal.split('.');
  const wei = BigInt(whole || '0') * 10n ** 18n + BigInt(fractional.padEnd(18, '0'));
  if (wei === 0n) throw new Error('Enter an amount greater than zero.');
  return { to, value: `0x${wei.toString(16)}` };
}
