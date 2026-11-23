"""SC6106 pages. Wallets sign transactions; the server never handles private keys."""
import os
from flask import Flask, abort, redirect, render_template, request, url_for


def create_app(test_config=None):
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 16384
    app.config['TRUSTED_HOSTS'] = ['sc6106-ay2026t1.onrender.com', 'localhost', '127.0.0.1']
    if test_config:
        app.config.update(test_config)

    @app.before_request
    def bounded_request():
        # No route accepts file uploads or a transaction body.
        if request.content_length and request.content_length > app.config['MAX_CONTENT_LENGTH']:
            abort(413)

    @app.route('/', methods=['GET', 'POST'])
    def index():
        return redirect(url_for('main'), code=303 if request.method == 'POST' else 302)

    @app.route('/main', methods=['GET', 'POST'])
    def main():
        if request.method == 'POST':
            return redirect(url_for('main'), code=303)
        return render_template('main.html', page='main', title='Main')

    @app.route('/transferMoney', methods=['GET', 'POST'])
    def transfer():
        if request.method == 'POST':
            return redirect(url_for('transfer'), code=303)
        return render_template('transfer.html', page='transfer', title='Transfer Money')

    @app.get('/store')
    @app.get('/storeMoney')
    def store():
        return render_template('store.html', page='store', title='Store Money')

    @app.get('/deposit')
    def legacy_deposit():
        return redirect('/store', code=302)

    @app.get('/transactions')
    def transactions():
        return render_template('transactions.html', page='transactions', title='Transaction')

    @app.get('/exit')
    def exit_page():
        return render_template('exit.html', page='exit', title='Exit')

    @app.get('/invoice')
    def invoice():
        return render_template('invoice.html', page='invoice', title='Invoice Tracker')

    @app.get('/setup')
    def setup():
        return render_template('setup.html', page='setup', title='Contract setup')

    @app.get('/health')
    def health():
        return {'status': 'ok', 'course': 'SC6106'}

    @app.after_request
    def response_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=()'
        response.headers['Strict-Transport-Security'] = 'max-age=31536000'
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
            "connect-src 'self' https://ethereum-sepolia-rpc.publicnode.com https://sepolia.drpc.org; "
            "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; worker-src 'none'"
        )
        if response.mimetype == 'text/html' or request.path.endswith('deployment.json'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    return app


app = create_app()
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.environ.get('PORT', '6106')))
