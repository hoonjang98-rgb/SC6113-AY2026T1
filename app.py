"""Serve the course DApp. Transactions are signed in the browser wallet."""
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, redirect, render_template, request, url_for


def create_app(test_config=None):
    load_dotenv(Path(__file__).with_name(".env"), override=False)
    app = Flask(__name__)
    app.config.from_mapping(
        CHAIN_ID=os.getenv("CHAIN_ID", "").strip(),
        TRANSFER_CONTRACT_ADDRESS=os.getenv("TRANSFER_CONTRACT_ADDRESS", "").strip(),
        DEPOSIT_CONTRACT_ADDRESS=os.getenv("DEPOSIT_CONTRACT_ADDRESS", "").strip(),
    )
    if test_config is not None:
        app.config.update(test_config)

    @app.context_processor
    def public_contract_config():
        # Only these public settings may be sent to the browser.
        return {"dapp_config": {
            "chainId": app.config["CHAIN_ID"],
            "transferAddress": app.config["TRANSFER_CONTRACT_ADDRESS"],
            "depositAddress": app.config["DEPOSIT_CONTRACT_ADDRESS"],
        }}

    def page(template, endpoint):
        # Old versions used POST for navigation; retain compatibility.
        if request.method == "POST":
            return redirect(url_for(endpoint), code=303)
        return render_template(template)

    @app.route("/", methods=["GET", "POST"])
    def index():
        return page("index.html", "index")

    @app.route("/main", methods=["GET", "POST"])
    def main():
        return page("main.html", "main")

    @app.route("/transferMoney", methods=["GET", "POST"])
    def transferMoney():
        return page("transferMoney.html", "transferMoney")

    @app.get("/deposit")
    def deposit():
        return render_template("deposit.html")

    return app


app = create_app()

if __name__ == "__main__":
    app.run()
