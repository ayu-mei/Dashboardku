import asyncio
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app.routes.uploads import content_of
from app.utils.config import settings

MB = 1024 * 1024

@pytest.mark.parametrize('size,accepted', [(0, False), (16 * MB, True), (50 * MB, True), (50 * MB + 1, False)])
def test_file_size_boundaries(monkeypatch, size, accepted):
    monkeypatch.delenv('MAX_UPLOAD_BYTES', raising=False)
    settings.cache_clear()
    class Upload:
        filename = 'data.xlsx'
        closed = False
        async def read(self, limit):
            assert limit == 50 * MB + 1
            return b'0' * min(size, limit)
        async def close(self):
            self.closed = True
    upload = Upload()
    try:
        assert settings().max_upload_bytes == 50 * MB
        if accepted:
            assert len(asyncio.run(content_of(upload))) == size
        else:
            with pytest.raises(HTTPException) as error:
                asyncio.run(content_of(upload))
            assert error.value.status_code == 400
            assert '50 MB' in error.value.detail
        assert upload.closed
    finally:
        settings.cache_clear()


def test_request_size_guard_keeps_multipart_overhead(monkeypatch):
    monkeypatch.delenv('MAX_UPLOAD_BYTES', raising=False)
    settings.cache_clear()
    try:
        with TestClient(app) as client:
            assert client.get('/health', headers={'content-length': str(50 * MB)}).status_code == 200
            response = client.get('/health', headers={'content-length': str(51 * MB + 1)})
            assert response.status_code == 413
            assert '50 MB' in response.json()['detail']
    finally:
        settings.cache_clear()
