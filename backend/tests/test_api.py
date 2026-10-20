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


def test_bulk_delete_validates_and_limits_to_explicit_selection(monkeypatch):
    from uuid import uuid4
    from app.services.database import authenticated
    from app.routes import dashboard
    from fastapi import HTTPException

    calls = []
    ids = [str(uuid4()) for _ in range(205)]
    fail = False

    async def fake_database(token, method, table, *, params):
        assert token == "owner-token"
        assert method == "DELETE"
        assert table in ("refraksi_sales", "refraksi_expenses")
        batch = params["id"][4:-1].split(",")
        assert 0 < len(batch) <= 100
        if fail and calls:
            raise HTTPException(503, "Unavailable")
        calls.append(batch)
        return [{"id": value} for value in batch]

    app.dependency_overrides[authenticated] = lambda: "owner-token"
    monkeypatch.setattr(dashboard, "database", fake_database)
    try:
        client = TestClient(app)
        assert client.post("/api/sales/bulk-delete", json={"ids": []}).status_code == 422
        assert client.post("/api/sales/bulk-delete", json={"ids": ["bad"]}).status_code == 422
        assert client.post("/api/other/bulk-delete", json={"ids": ids[:1]}).status_code == 404
        assert calls == []
        result = client.post("/api/sales/bulk-delete", json={"ids": ids + ids[:1]})
        assert result.json() == {"deleted": 205, "requested": 205, "complete": True}
        assert [value for batch in calls for value in batch] == ids
        calls.clear()
        assert client.post("/api/expenses/bulk-delete", json={"ids": ids[:1]}).json()["deleted"] == 1
        calls.clear()
        fail = True
        result = client.post("/api/sales/bulk-delete", json={"ids": ids}).json()
        assert result["deleted"] == 100
        assert result["complete"] is False
    finally:
        app.dependency_overrides.clear()
    assert TestClient(app).post("/api/sales/bulk-delete", json={"ids": ids[:1]}).status_code in (401, 503)
