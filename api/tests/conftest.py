"""
Test configuration and fixtures.
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from datetime import datetime

# Import the FastAPI app
import sys
import os

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

from src.main import app
from src.storage import Storage
from src.auth import OAuthManager
from src.huawei_client import HuaweiClient


@pytest_asyncio.fixture(scope="function")
async def init_test_app():
    """Initialize test app with mocked dependencies.

    Note: httpx ASGITransport does not run ASGI lifespan events, so the
    mocked dependencies are installed directly on the module globals that
    the routes read (src.main.storage / oauth_manager / huawei_client).
    """
    test_storage = AsyncMock(spec=Storage)
    test_oauth = MagicMock(spec=OAuthManager)
    # Use the real URL builder so generated authorization URLs are realistic.
    real_oauth = OAuthManager(test_storage)
    test_oauth.get_authorization_url = real_oauth.get_authorization_url
    test_oauth.is_authenticated = AsyncMock(return_value=False)
    test_oauth.exchange_code_for_token = AsyncMock()
    test_oauth.refresh_access_token = AsyncMock()
    test_oauth.logout = AsyncMock()
    test_oauth.get_valid_token = AsyncMock(return_value=None)
    test_client = MagicMock(spec=HuaweiClient)

    import src.main

    src.main.storage = test_storage
    src.main.oauth_manager = test_oauth
    src.main.huawei_client = test_client

    yield app

    # Cleanup
    src.main.storage = None
    src.main.oauth_manager = None
    src.main.huawei_client = None


@pytest_asyncio.fixture
async def client(init_test_app):
    """Create async test client (no lifespan; mocks installed via init_test_app)."""
    async with AsyncClient(
        transport=ASGITransport(app=init_test_app), base_url="http://test"
    ) as client:
        yield client


@pytest_asyncio.fixture
async def mock_storage():
    """Mock storage instance."""
    storage = AsyncMock(spec=Storage)
    storage.get_token = AsyncMock(return_value=None)
    storage.save_token = AsyncMock()
    storage.delete_token = AsyncMock()
    storage.get_cached_data = AsyncMock(return_value=None)
    storage.set_cached_data = AsyncMock()
    return storage


@pytest_asyncio.fixture
async def mock_oauth_manager(mock_storage):
    """Mock OAuth manager."""
    oauth = MagicMock(spec=OAuthManager)
    oauth.get_authorization_url = MagicMock(
        return_value="https://oauth.example.com/auth?client_id=test"
    )
    oauth.exchange_code_for_token = AsyncMock()
    oauth.refresh_access_token = AsyncMock()
    oauth.is_authenticated = AsyncMock(return_value=False)
    oauth.logout = AsyncMock()
    return oauth


@pytest.fixture
def mock_huawei_api_response():
    """Mock Huawei API response for polymerize endpoint."""
    return {
        "polymerizeData": [
            {
                "dataTypeName": "com.huawei.continuous.steps.delta",
                "startTime": "2026-03-27T00:00:00.000Z",
                "endTime": "2026-03-27T23:59:59.000Z",
                "aggregateType": "daily",
                "value": 8500,
                "distance": 6500.0,
                "calories": 350.0,
            }
        ]
    }


@pytest.fixture
def mock_huawei_heart_rate_response():
    """Mock Huawei API response for heart rate."""
    return {
        "dataPoints": [
            {
                "startTime": "2026-03-27T08:00:00.000Z",
                "endTime": "2026-03-27T08:01:00.000Z",
                "value": 72,
            },
            {
                "startTime": "2026-03-27T09:00:00.000Z",
                "endTime": "2026-03-27T09:01:00.000Z",
                "value": 85,
            },
        ]
    }


@pytest.fixture
def mock_huawei_sleep_response():
    """Mock Huawei API response for sleep."""
    return {
        "sleepData": {
            "bedtime": "2026-03-26T23:00:00.000Z",
            "wakeup": "2026-03-27T07:00:00.000Z",
            "duration": 480,
            "score": 85,
            "apneaEvents": 0,
            "spo2Avg": 97.5,
            "sleepSegments": [
                {
                    "phase": 1,
                    "startTime": "2026-03-26T23:00:00.000Z",
                    "endTime": "2026-03-27T01:00:00.000Z",
                    "duration": 120,
                },
                {
                    "phase": 2,
                    "startTime": "2026-03-27T01:00:00.000Z",
                    "endTime": "2026-03-27T06:00:00.000Z",
                    "duration": 300,
                },
                {
                    "phase": 3,
                    "startTime": "2026-03-27T06:00:00.000Z",
                    "endTime": "2026-03-27T07:00:00.000Z",
                    "duration": 60,
                },
            ],
        }
    }
