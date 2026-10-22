"""
Integration tests for Storage using a real temporary SQLite database.
"""

import pytest
import pytest_asyncio

from src.storage import Storage, get_storage, close_storage


@pytest_asyncio.fixture
async def storage(tmp_path):
    store = Storage(db_path=str(tmp_path / "test.db"))
    await store.connect()
    yield store
    await store.disconnect()


class TestStorageTokens:
    @pytest.mark.asyncio
    async def test_save_and_get_token(self, storage):
        token = {
            "access_token": "at",
            "refresh_token": "rt",
            "expires_in": 3600,
            "token_type": "Bearer",
            "expires_at": "2099-01-01T00:00:00",
        }
        await storage.save_token(token)
        stored = await storage.get_token()
        assert stored["access_token"] == "at"
        assert stored["refresh_token"] == "rt"

    @pytest.mark.asyncio
    async def test_save_token_replaces_existing(self, storage):
        for i in (1, 2):
            await storage.save_token(
                {
                    "access_token": f"at{i}",
                    "refresh_token": "rt",
                    "expires_in": 3600,
                    "expires_at": "2099-01-01T00:00:00",
                }
            )
        stored = await storage.get_token()
        assert stored["access_token"] == "at2"

    @pytest.mark.asyncio
    async def test_get_token_empty(self, storage):
        assert await storage.get_token() is None

    @pytest.mark.asyncio
    async def test_delete_token(self, storage):
        await storage.save_token(
            {
                "access_token": "at",
                "refresh_token": "rt",
                "expires_in": 3600,
                "expires_at": "2099-01-01T00:00:00",
            }
        )
        await storage.delete_token()
        assert await storage.get_token() is None


class TestStorageCache:
    @pytest.mark.asyncio
    async def test_set_and_get_cached_data(self, storage):
        await storage.set_cached_data(
            "steps", "2026-10-22", {"value": 100}, ttl_seconds=3600
        )
        cached = await storage.get_cached_data("steps", "2026-10-22")
        assert cached == {"value": 100}

    @pytest.mark.asyncio
    async def test_get_missing_cache_returns_none(self, storage):
        assert await storage.get_cached_data("steps", "1999-01-01") is None

    @pytest.mark.asyncio
    async def test_expired_cache_not_returned(self, storage):
        await storage.set_cached_data(
            "steps", "2026-10-22", {"value": 1}, ttl_seconds=0
        )
        assert await storage.get_cached_data("steps", "2026-10-22") is None

    @pytest.mark.asyncio
    async def test_clear_expired_cache(self, storage):
        # Insert an already-expired row directly (negative TTL is not expressible).
        await storage._db.execute(
            "INSERT INTO health_cache (data_type, date, data_json, expires_at) "
            "VALUES ('old', '2026-10-22', '{}', datetime('now', '-1 hour'))"
        )
        await storage._db.commit()
        await storage.set_cached_data("new", "2026-10-22", {}, ttl_seconds=3600)
        deleted = await storage.clear_expired_cache()
        assert deleted >= 1
        assert await storage.get_cached_data("old", "2026-10-22") is None
        assert await storage.get_cached_data("new", "2026-10-22") == {}

    @pytest.mark.asyncio
    async def test_clear_all_cache(self, storage):
        await storage.set_cached_data("steps", "2026-10-22", {}, ttl_seconds=3600)
        await storage.clear_all_cache()
        assert await storage.get_cached_data("steps", "2026-10-22") is None


class TestStorageGlobal:
    @pytest.mark.asyncio
    async def test_get_storage_and_close(self, tmp_path, monkeypatch):
        import src.storage as storage_module

        # Reset global state and point config at a temp DB.
        storage_module._storage = None

        import src.config

        real_settings = src.config.get_settings()
        monkeypatch.setattr(
            storage_module,
            "get_settings",
            lambda: real_settings.model_copy(
                update={"database_url": f"sqlite+aiosqlite:///{tmp_path}/global.db"}
            ),
        )
        store = await storage_module.get_storage()
        assert store is await storage_module.get_storage()  # cached singleton
        await storage_module.close_storage()
        assert storage_module._storage is None
