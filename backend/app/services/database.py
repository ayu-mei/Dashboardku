import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.utils.config import settings

bearer = HTTPBearer(auto_error=False)


class AuthToken(str):
    user_id: str


async def authenticated(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    config = settings()
    if not config.supabase_url or not config.supabase_publishable_key:
        raise HTTPException(503, "Backend belum dikonfigurasi. Hubungi administrator.")
    if not credentials:
        raise HTTPException(401, "Silakan masuk terlebih dahulu.")
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            response = await client.get(
                config.supabase_url.rstrip("/") + "/auth/v1/user",
                headers={
                    "apikey": config.supabase_publishable_key,
                    "Authorization": "Bearer " + credentials.credentials,
                },
            )
        except httpx.RequestError:
            raise HTTPException(503, "Layanan login belum dapat dihubungi.")
    if response.status_code != 200:
        raise HTTPException(401, "Sesi berakhir. Silakan masuk kembali.")
    if not response.json().get("id"):
        raise HTTPException(401, "Sesi tidak valid.")
    token = AuthToken(credentials.credentials)
    token.user_id = response.json()["id"]
    return token


async def database(token, method, table, *, params=None, body=None, headers=None):
    config = settings()
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.request(
                method,
                config.supabase_url.rstrip("/") + "/rest/v1/" + table,
                params=params,
                json=body,
                headers={
                    "apikey": config.supabase_publishable_key,
                    "Authorization": "Bearer " + token,
                    "Prefer": "return=representation",
                    **(headers or {}),
                },
            )
        except httpx.RequestError:
            raise HTTPException(503, "Database belum dapat dihubungi. Coba lagi.")
    if response.status_code >= 400:
        code = response.json().get("code") if response.content else None
        if table == "refraksi_sources" and code in {"PGRST205", "42P01"}:
            from app.services.sources import SourceSchemaMissing
            raise SourceSchemaMissing()
        if table == "refraksi_sources" and code in {"23505", "P0001"}:
            raise HTTPException(409, "Data sudah tersimpan atau beririsan dengan sumber lain. Muat ulang dan periksa sumber utama sebelum impor ulang.")
        if response.status_code in (401, 403):
            raise HTTPException(
                response.status_code, "Sesi atau izin akses tidak valid."
            )
        if response.status_code == 409:
            raise HTTPException(
                409, "Data sudah pernah diimpor, beririsan dengan rekap tersimpan, atau ID sudah digunakan."
            )
        raise HTTPException(
            400,
            "Database menolak data. Periksa input dan pastikan migrasi database sudah dijalankan.",
        )
    return response.json() if response.content else []


async def all_records(token, table):
    rows, offset = [], 0
    while True:
        page = await database(
            token,
            "GET",
            table,
            params={"select": "*", "order": "id.asc", "offset": offset, "limit": 1000},
        )
        rows.extend(page)
        if len(page) < 1000:
            return rows
        offset += 1000
