(() => {
  'use strict';
  const key = 'sc6106.invoice.payment.v1';
  const payment = document.getElementById('invoice-payment');
  const status = document.getElementById('status');

  function refresh() {
    const paid = localStorage.getItem(key) === 'paid';
    payment.textContent = paid ? 'Paid' : 'Unpaid';
    return paid;
  }

  function perform(action) {
    status.hidden = true;
    try {
      const message = action();
      if (message) {
        status.textContent = message;
        status.className = 'status';
        status.hidden = false;
      }
    } catch {
      payment.textContent = 'Unavailable';
      status.textContent = 'Invoice storage is unavailable. Enable site storage and try again.';
      status.className = 'status error';
      status.hidden = false;
    }
  }

  document.getElementById('pay-invoice').addEventListener('click', () => perform(() => {
    if (refresh()) return 'This invoice is already marked as paid.';
    localStorage.setItem(key, 'paid');
    refresh();
  }));
  document.getElementById('reset-invoice').addEventListener('click', () => perform(() => {
    localStorage.removeItem(key);
    refresh();
  }));
  document.getElementById('view-invoice').addEventListener('click', () => perform(() => {
    refresh();
    return 'Invoice status refreshed.';
  }));
  window.addEventListener('pageshow', () => perform(() => { refresh(); }));
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) perform(() => { refresh(); });
  });
  perform(() => { refresh(); });
})();
