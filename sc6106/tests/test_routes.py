import unittest
from app import create_app

class Routes(unittest.TestCase):
    def setUp(self):
        self.client = create_app({'TESTING': True}).test_client()

    def test_pages_and_headers(self):
        for route in ['/main', '/transferMoney', '/store', '/storeMoney', '/transactions', '/exit', '/setup']:
            response = self.client.get(route)
            self.assertEqual(response.status_code, 200, route)
            self.assertIn("script-src 'self'", response.headers['Content-Security-Policy'])
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(self.client.get('/health').json['course'], 'SC6106')

    def test_menu_and_blank_address(self):
        main = self.client.get('/main').text
        self.assertLess(main.index('Transfer Money'), main.index('>Store<'))
        self.assertLess(main.index('>Store<'), main.index('>Exit<'))
        store = self.client.get('/store').text
        self.assertIn('placeholder="Enter wallet address"', store)
        self.assertNotIn('value="0x', store)
        self.assertNotIn('0407e478', store)

    def test_no_server_signing_and_assets(self):
        self.assertEqual(self.client.post('/store',json={'private_key':'not-a-key'}).status_code,405)
        for file in ['core.js','app.js','styles.css','contracts/SepoliaStore.json','vendor/ethers.umd.min.js','deployment.json']:
            with self.client.get('/static/'+file) as response:
                self.assertEqual(response.status_code,200,file)
        self.assertEqual(self.client.get('/.env').status_code,404)

    def test_public_attack_surface(self):
        for route in ['/.env','/.git/config','/app.py','/requirements.txt','/static/../app.py','/static/%2e%2e/app.py','/console','/debug','/node_modules/ethers/package.json']:
            self.assertEqual(self.client.get(route).status_code,404,route)
        self.assertEqual(self.client.get('/main',headers={'Host':'attacker.invalid'}).status_code,400)
        self.assertEqual(self.client.post('/main',data=b'x'*16385).status_code,413)
        self.assertEqual(self.client.get('/store?wallet=%3Cscript%3Ealert(1)%3C/script%3E').text.count('<script>alert(1)</script>'),0)

    def test_privacy_and_browser_restrictions(self):
        response=self.client.get('/store')
        self.assertEqual(response.headers['Referrer-Policy'],'no-referrer')
        self.assertIn("form-action 'none'",response.headers['Content-Security-Policy'])
        self.assertIn("frame-ancestors 'none'",response.headers['Content-Security-Policy'])
        self.assertIn('camera=()',response.headers['Permissions-Policy'])
        self.assertNotIn('Set-Cookie',response.headers)
        self.assertNotIn('name="wallet"',response.text)

if __name__ == '__main__': unittest.main()
