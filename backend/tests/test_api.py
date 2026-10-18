from fastapi.testclient import TestClient
from app.main import app


def test_missing_auth_is_rejected(monkeypatch):
    from app.utils.config import settings

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    settings.cache_clear()
    client = TestClient(app)
    assert client.get("/api/dashboard").status_code == 401
    assert client.get("/api/export").status_code == 401
    assert client.post("/api/sales", json={}).status_code == 401
    assert client.post("/api/import/inspect").status_code == 401
    assert client.get("/health").status_code == 200
    assert client.get("/health").headers["cache-control"] == "no-store"
    settings.cache_clear()


def test_cors_does_not_allow_unknown_origins():
    client = TestClient(app)
    response = client.options(
        "/api/dashboard",
        headers={
            "Origin": "https://not-authorized.example",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_dashboard_api_filter_validation(monkeypatch):
    from app.services.database import authenticated, AuthToken
    from app.routes import dashboard

    token = AuthToken("test-token")
    token.user_id = "test-user"
    app.dependency_overrides[authenticated] = lambda: token

    async def fake_records(token, table):
        return []

    monkeypatch.setattr(dashboard, "all_records", fake_records)
    try:
        client = TestClient(app)
        response = client.get("/api/dashboard?year=2026")
        assert response.status_code == 200
        assert response.json()["metrics"]["net_margin"] is None
        assert client.get("/api/dashboard?year=0").status_code == 422
        assert client.get(
            "/api/dashboard?start=2026-02-01&end=2026-01-01"
        ).status_code in (400, 422)
        assert (
            client.post(
                "/api/sales",
                json={
                    "date": "2026-01-01",
                    "product": "Lensa",
                    "quantity": True,
                    "price": 100,
                    "unit_cost": 50,
                },
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/api/import/inspect", files={"file": ("bad.csv", b"bad", "text/csv")}
            ).status_code
            == 400
        )
    finally:
        app.dependency_overrides.clear()
