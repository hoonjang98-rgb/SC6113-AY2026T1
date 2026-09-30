import json
import re
import unittest

from app import create_app


class AppTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({
            "TESTING": True, "CHAIN_ID": "1337",
            "TRANSFER_CONTRACT_ADDRESS": "0x" + "1" * 40,
            "DEPOSIT_CONTRACT_ADDRESS": "0x" + "2" * 40,
            "SECRET_KEY": "must-not-be-exposed",
        })
        self.client = self.app.test_client()

    def test_all_pages_render_complete_html(self):
        for path in ("/", "/main", "/deposit", "/transferMoney"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                text = response.get_data(as_text=True)
                self.assertIn("<!DOCTYPE html>", text)
                self.assertIn("<h1>", text)
                self.assertIn('href="/deposit"', text)
                self.assertIn('href="/transferMoney"', text)

    def test_legacy_navigation_posts_redirect_to_get(self):
        for path in ("/", "/main", "/transferMoney"):
            with self.subTest(path=path):
                response = self.client.post(path)
                self.assertEqual(response.status_code, 303)
                self.assertEqual(response.location, path)
                self.assertEqual(self.client.get(response.location).status_code, 200)

    def test_only_public_configuration_is_injected(self):
        text = self.client.get("/deposit").get_data(as_text=True)
        data = json.loads(re.search(r'<script id="dapp-config" type="application/json">(.*?)</script>', text).group(1))
        self.assertEqual(set(data), {"chainId", "depositAddress", "transferAddress"})
        self.assertEqual(data["chainId"], "1337")
        self.assertNotIn("must-not-be-exposed", text)

    def test_configuration_is_safe_in_script_element(self):
        self.app.config["DEPOSIT_CONTRACT_ADDRESS"] = '</script><script>alert("x")</script>'
        text = self.client.get("/deposit").get_data(as_text=True)
        self.assertNotIn('</script><script>alert', text)
        self.assertIn(r"\u003c/script\u003e", text)

    def test_missing_settings_show_setup_instructions(self):
        self.app.config["CHAIN_ID"] = ""
        self.assertIn("Contract setup is incomplete", self.client.get("/").get_data(as_text=True))

    def test_payer_cannot_be_edited_and_amount_is_not_a_float_input(self):
        text = self.client.get("/transferMoney").get_data(as_text=True)
        self.assertIn('id="payer" readonly', text)
        self.assertIn('id="amount" type="text"', text)

    def test_static_assets_are_available(self):
        for path in ("/static/styles.css", "/static/dapp.js"):
            with self.subTest(path=path):
                with self.client.get(path) as response:
                    self.assertEqual(response.status_code, 200)
                    self.assertGreater(len(response.data), 100)

    def test_post_is_not_a_deposit_transaction_endpoint(self):
        self.assertEqual(self.client.post("/deposit").status_code, 405)


if __name__ == "__main__":
    unittest.main()

