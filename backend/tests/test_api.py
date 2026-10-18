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
    assert client.get("/api/analysis").status_code == 401
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
        analysis = client.get("/api/analysis?year=2026&month=1")
        assert analysis.status_code == 200
        assert analysis.json()["has_sales"] is False
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


def test_authentication_validates_supabase_session(monkeypatch):
    import httpx
    from app.services import database
    from app.routes import dashboard
    from app.utils.config import settings
    monkeypatch.setenv('SUPABASE_URL', 'https://auth-test.supabase.co')
    monkeypatch.setenv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    settings.cache_clear()
    calls = []
    class AuthClient:
        def __init__(self, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def get(self, url, *, headers):
            calls.append((url, headers))
            if headers['Authorization'] == 'Bearer valid-session':
                return httpx.Response(200, json={'id': 'account-a'})
            return httpx.Response(401, json={'message': 'expired'})
    async def records(token, table):
        assert token.user_id == 'account-a'
        return []
    monkeypatch.setattr(database.httpx, 'AsyncClient', AuthClient)
    monkeypatch.setattr(dashboard, 'all_records', records)
    try:
        with TestClient(app) as client:
            assert client.get('/api/dashboard', headers={'Authorization': 'Bearer valid-session'}).status_code == 200
            assert client.get('/api/analysis', headers={'Authorization': 'Bearer expired-session'}).status_code == 401
            assert calls[0][0] == 'https://auth-test.supabase.co/auth/v1/user'
            assert calls[0][1]['apikey'] == 'sb_publishable_test'
    finally:
        settings.cache_clear()
