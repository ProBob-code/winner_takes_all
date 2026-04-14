from fastapi.testclient import TestClient
import pytest
from app.main import app
from app.db import SQLAlchemyRepository
from app.service import WTAService
from pathlib import Path
from tempfile import gettempdir
from uuid import uuid4
import app.main as main_module

@pytest.fixture
def client() -> TestClient:
    db_dir = Path(gettempdir()) / "wta-api-tests"
    db_dir.mkdir(parents=True, exist_ok=True)
    db_path = db_dir / f"wta-payment-test-{uuid4().hex}.db"
    database_url = f"sqlite:///{db_path.as_posix()}"
    main_module.service = WTAService(
        SQLAlchemyRepository(
            database_url=database_url,
            initialize_schema=True,
            seed_defaults=True,
        )
    )
    with TestClient(main_module.app) as test_client:
        yield test_client
    main_module.service.store.engine.dispose()
    if db_path.exists():
        try:
            db_path.unlink()
        except PermissionError:
            pass

def test_payment_flow_records_is_test_correctly(client: TestClient) -> None:
    # 1. Signup
    client.post("/auth/signup", json={"name": "Payer", "email": "payer@test.com", "password": "password123"})
    
    # 2. Create order (Mock get_key_id to return a test key)
    import app.main as main
    from unittest.mock import patch
    
    with patch("app.main.get_key_id", return_value="rzp_test_mocked"):
        res = client.post("/payments/create-order", json={"amount": 100})
        assert res.status_code == 200
        order_data = res.json()
        assert order_data["keyId"] == "rzp_test_mocked"
        razorpay_order_id = order_data["razorpayOrderId"]

    # 3. Verify payment (Mock verification)
    with patch("app.main.verify_payment_signature", return_value=True):
        verify_res = client.post("/payments/verify", json={
            "razorpayOrderId": razorpay_order_id,
            "razorpayPaymentId": "pay_mocked",
            "razorpaySignature": "sig_mocked"
        })
        assert verify_res.status_code == 200

    # 4. Check wallet entries
    wallet_res = client.get("/wallet")
    assert wallet_res.status_code == 200
    wallet = wallet_res.json()["wallet"]
    assert wallet["balance"]["amount"] == "3100.00" # 3000 + 100
    
    transactions = wallet["transactions"]
    topup_tx = next(tx for tx in transactions if tx["type"] == "deposit")
    assert topup_tx["isTest"] is True
    assert topup_tx["amount"]["amount"] == "100.00"
