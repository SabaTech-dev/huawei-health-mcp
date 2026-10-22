"""
Tests for OAuth token handling, retry/resilience behavior, and storage.
"""

import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from src.auth import OAuthError, OAuthManager, TokenData
from src.config import get_settings
from src.huawei_client import (
    HuaweiAPIError,
    HuaweiClient,
    RateLimiter,
    RETRYABLE_STATUS_CODES,
)
from src.storage import Storage


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_token_response(payload: dict, status_code: int = 200) -> httpx.Response:
    return httpx.Response(
        status_code,
        json=payload,
        headers={"content-type": "application/json"},
        request=httpx.Request("POST", "https://token.example"),
    )


def oauth_with_transport(handler) -> OAuthManager:
    """OAuthManager whose token requests go through a mock transport."""
    settings = get_settings()
    original_url = settings.huawei_token_url
    # Point the token URL at the mock transport base.
    settings.huawei_token_url = "https://token.example/token"
    manager = OAuthManager(AsyncMock(spec=Storage))
    manager._transport = httpx.MockTransport(handler)
    original_init = httpx.AsyncClient

    def patched_client(*args, **kwargs):
        kwargs.pop("transport", None)
        return original_init(transport=manager._transport, *args, **kwargs)

    manager._client_factory = patched_client
    return manager


def make_client(max_retries=2, rate_limit=0) -> HuaweiClient:
    """HuaweiClient with a mock-transport HTTP client and no rate limiting."""
    oauth = MagicMock()
    oauth.get_valid_token = AsyncMock(
        return_value=TokenData(access_token="tok", refresh_token="ref", expires_in=3600)
    )
    client = HuaweiClient(oauth, AsyncMock(spec=Storage))
    client.settings.huawei_max_retries = max_retries
    client.settings.huawei_rate_limit_per_minute = rate_limit
    client.settings.huawei_retry_backoff_seconds = 0.0
    return client


# ---------------------------------------------------------------------------
# TokenData
# ---------------------------------------------------------------------------


class TestTokenData:
    def test_not_expired_when_fresh(self):
        token = TokenData(access_token="a", refresh_token="r", expires_in=3600)
        assert not token.is_expired()

    def test_expired_when_past(self):
        token = TokenData(
            access_token="a",
            refresh_token="r",
            expires_in=3600,
            expires_at=datetime.utcnow() - timedelta(seconds=10),
        )
        assert token.is_expired()

    def test_roundtrip_dict(self):
        token = TokenData(access_token="a", refresh_token="r", expires_in=1200)
        restored = TokenData.from_dict(token.to_dict())
        assert restored.access_token == "a"
        assert restored.refresh_token == "r"
        assert restored.expires_at == token.expires_at


# ---------------------------------------------------------------------------
# OAuthManager._token_request
# ---------------------------------------------------------------------------


class TestTokenRequest:
    @pytest.mark.asyncio
    async def test_network_error_raises_oauth_error(self, monkeypatch):
        manager = OAuthManager(AsyncMock(spec=Storage))

        class FailingClient:
            def __init__(self, *a, **k):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, *a, **k):
                raise httpx.ConnectError("connection refused")

        monkeypatch.setattr("src.auth.httpx.AsyncClient", FailingClient)
        with pytest.raises(OAuthError) as exc_info:
            await manager._token_request({"grant_type": "refresh_token"})
        assert exc_info.value.code == "network_error"

    @pytest.mark.asyncio
    async def test_non_json_error_response(self, monkeypatch):
        manager = OAuthManager(AsyncMock(spec=Storage))

        class FailingClient:
            def __init__(self, *a, **k):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, *a, **k):
                return httpx.Response(
                    500,
                    content=b"server exploded",
                    headers={"content-type": "text/plain"},
                    request=httpx.Request("POST", "https://token.example"),
                )

        monkeypatch.setattr("src.auth.httpx.AsyncClient", FailingClient)
        with pytest.raises(OAuthError) as exc_info:
            await manager._token_request({"grant_type": "refresh_token"})
        assert "500" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_exchange_success_stores_token(self, monkeypatch):
        storage = AsyncMock(spec=Storage)
        manager = OAuthManager(storage)

        class OkClient:
            def __init__(self, *a, **k):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, *a, **k):
                return make_token_response(
                    {
                        "access_token": "at",
                        "refresh_token": "rt",
                        "expires_in": 3600,
                        "token_type": "Bearer",
                    }
                )

        monkeypatch.setattr("src.auth.httpx.AsyncClient", OkClient)
        token = await manager.exchange_code_for_token("auth-code")
        assert token.access_token == "at"
        storage.save_token.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_refresh_keeps_old_refresh_token_when_absent(self, monkeypatch):
        storage = AsyncMock(spec=Storage)
        manager = OAuthManager(storage)

        class OkClient:
            def __init__(self, *a, **k):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, *a, **k):
                return make_token_response({"access_token": "at2", "expires_in": 3600})

        monkeypatch.setattr("src.auth.httpx.AsyncClient", OkClient)
        token = await manager.refresh_access_token("old-rt")
        assert token.refresh_token == "old-rt"

    @pytest.mark.asyncio
    async def test_get_valid_token_without_stored_token(self):
        storage = AsyncMock(spec=Storage)
        storage.get_token = AsyncMock(return_value=None)
        manager = OAuthManager(storage)
        assert await manager.get_valid_token() is None

    @pytest.mark.asyncio
    async def test_get_valid_token_reuses_cache(self):
        manager = OAuthManager(AsyncMock(spec=Storage))
        cached = TokenData(access_token="a", refresh_token="r", expires_in=3600)
        manager._token = cached
        assert await manager.get_valid_token() is cached

    @pytest.mark.asyncio
    async def test_get_valid_token_clears_on_refresh_failure(self, monkeypatch):
        stored = TokenData(
            access_token="a",
            refresh_token="r",
            expires_in=3600,
            expires_at=datetime.utcnow() - timedelta(seconds=5),
        ).to_dict()
        storage = AsyncMock(spec=Storage)
        storage.get_token = AsyncMock(return_value=stored)
        manager = OAuthManager(storage)

        async def failing_refresh(refresh_token):
            raise OAuthError("expired", code="invalid_grant")

        monkeypatch.setattr(manager, "refresh_access_token", failing_refresh)
        assert await manager.get_valid_token() is None
        storage.delete_token.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_is_authenticated_and_logout(self):
        storage = AsyncMock(spec=Storage)
        manager = OAuthManager(storage)
        manager._token = TokenData(access_token="a", refresh_token="r", expires_in=3600)
        assert await manager.is_authenticated() is True
        await manager.logout()
        assert manager._token is None
        storage.delete_token.assert_awaited_once()

    def test_authorization_url_includes_params(self):
        manager = OAuthManager(AsyncMock(spec=Storage))
        url = manager.get_authorization_url(state="abc")
        assert "client_id=" in url
        assert "response_type=code" in url
        assert "state=abc" in url


# ---------------------------------------------------------------------------
# RateLimiter + retries in HuaweiClient
# ---------------------------------------------------------------------------


class TestRateLimiter:
    @pytest.mark.asyncio
    async def test_disabled_limiter_returns_immediately(self):
        limiter = RateLimiter(0)
        await asyncio.wait_for(limiter.acquire(), timeout=0.1)

    @pytest.mark.asyncio
    async def test_limiter_enforces_interval(self):
        limiter = RateLimiter(60000)  # 1 ms interval
        await limiter.acquire()
        start = asyncio.get_event_loop().time()
        await limiter.acquire()
        elapsed = asyncio.get_event_loop().time() - start
        assert elapsed >= 0.0005


class TestRetries:
    @pytest.mark.asyncio
    async def test_retries_429_then_succeeds(self, monkeypatch):
        client = make_client(max_retries=2, rate_limit=0)
        responses = [
            make_token_response({"error": "rate_limited"}, status_code=429),
            make_token_response({"polymerizeData": []}),
        ]

        async def fake_request(method, path, json=None, headers=None):
            return responses.pop(0)

        fake_http = MagicMock()
        fake_http.request = AsyncMock(side_effect=fake_request)
        monkeypatch.setattr(client, "_get_client", AsyncMock(return_value=fake_http))

        result = await client._request_with_retries(
            "POST", "/sampleSet:polymerize", {}, {}
        )
        assert result == {"polymerizeData": []}
        assert fake_http.request.await_count == 2

    @pytest.mark.asyncio
    async def test_exhausted_retries_raises_last_error(self, monkeypatch):
        client = make_client(max_retries=1, rate_limit=0)
        client.settings.huawei_retry_backoff_seconds = 0.0

        async def fake_request(method, path, json=None, headers=None):
            return make_token_response({"error": "server_error"}, status_code=500)

        fake_http = MagicMock()
        fake_http.request = AsyncMock(side_effect=fake_request)
        monkeypatch.setattr(client, "_get_client", AsyncMock(return_value=fake_http))

        with pytest.raises(HuaweiAPIError) as exc_info:
            await client._request_with_retries("POST", "/dataRecord", {}, {})
        assert exc_info.value.status_code == 500
        assert fake_http.request.await_count == 2  # 1 + 1 retry

    @pytest.mark.asyncio
    async def test_non_retryable_error_fails_fast(self, monkeypatch):
        client = make_client(max_retries=2, rate_limit=0)

        async def fake_request(method, path, json=None, headers=None):
            return make_token_response({"error": "invalid"}, status_code=403)

        fake_http = MagicMock()
        fake_http.request = AsyncMock(side_effect=fake_request)
        monkeypatch.setattr(client, "_get_client", AsyncMock(return_value=fake_http))

        with pytest.raises(HuaweiAPIError) as exc_info:
            await client._request_with_retries("POST", "/dataRecord", {}, {})
        assert exc_info.value.status_code == 403
        assert fake_http.request.await_count == 1

    def test_retryable_status_codes_defined(self):
        assert 429 in RETRYABLE_STATUS_CODES
        assert 503 in RETRYABLE_STATUS_CODES

    @pytest.mark.asyncio
    async def test_unauthenticated_raises_401(self):
        oauth = MagicMock()
        oauth.get_valid_token = AsyncMock(return_value=None)
        client = HuaweiClient(oauth, AsyncMock(spec=Storage))
        with pytest.raises(HuaweiAPIError) as exc_info:
            await client._get_headers()
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_close_is_idempotent(self):
        client = make_client()
        client._client = None
        await client.close()  # must not raise
