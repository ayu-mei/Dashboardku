import asyncio
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app.routes.uploads import content_of
from app.utils.config import settings

MB = 1024 * 1024


@pytest.mark.parametrize('size,accepted', [(100 * MB + 1, True), (256 * MB, True), (256 * MB + 1, False)])
def test_expanded_workbook_size_boundaries(monkeypatch, size, accepted):
    from types import SimpleNamespace
    from unittest.mock import Mock
    from app.services import excel

    monkeypatch.delenv('MAX_WORKBOOK_BYTES', raising=False)
    settings.cache_clear()
    archive = Mock()
    archive.__enter__ = Mock(return_value=archive)
    archive.__exit__ = Mock(return_value=False)
    archive.infolist.return_value = [SimpleNamespace(filename='xl/worksheets/sheet1.xml', file_size=size)]
    monkeypatch.setattr(excel, 'ZipFile', Mock(return_value=archive))
    loader = Mock()
    monkeypatch.setattr(excel, 'load_workbook', loader)
    try:
        if accepted:
            excel.checked_workbook(b'content')
            loader.assert_called_once()
            assert loader.call_args.kwargs['read_only'] is True
        else:
            with pytest.raises(HTTPException, match='256 MB'):
                excel.checked_workbook(b'content')
            loader.assert_not_called()
    finally:
        settings.cache_clear()


def test_expanded_workbook_limit_is_configurable(monkeypatch):
    monkeypatch.setenv('MAX_WORKBOOK_BYTES', str(128 * MB))
    settings.cache_clear()
    try:
        assert settings().max_workbook_bytes == 128 * MB
    finally:
        settings.cache_clear()

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
