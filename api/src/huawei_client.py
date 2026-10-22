"""
Huawei Health Kit REST API client.
Implements all endpoints for accessing health data.
"""

import asyncio
import httpx
import logging
import time
from datetime import datetime, date
from typing import Optional, Dict, Any, List

from .config import get_settings
from .auth import OAuthManager, TokenData, OAuthError
from .storage import Storage

logger = logging.getLogger(__name__)

# Status codes that are transient and worth retrying.
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


class RateLimiter:
    """Simple in-process token bucket limiter (calls per minute)."""

    def __init__(self, calls_per_minute: int):
        self._min_interval = 60.0 / calls_per_minute if calls_per_minute > 0 else 0.0
        self._last_call: float = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        if self._min_interval <= 0:
            return
        async with self._lock:
            now = time.monotonic()
            wait = self._last_call + self._min_interval - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_call = time.monotonic()


class HuaweiAPIError(Exception):
    """Error from Huawei Health API."""

    def __init__(self, message: str, status_code: int = None, error_code: str = None):
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code


class HuaweiClient:
    """Client for Huawei Health Kit REST API."""

    # Data type names as per Huawei API
    DATA_TYPES = {
        "steps": "com.huawei.continuous.steps.delta",
        "heart_rate_instant": "com.huawei.instantaneous.heart_rate",
        "heart_rate_continuous": "com.huawei.continuous.heart_rate.delta",
        "sleep": "com.huawei.sleep.detail",
        "spo2_continuous": "com.huawei.continuous.blood_oxygen",
        "spo2_instant": "com.huawei.instantaneous.blood_oxygen",
        "stress": "com.huawei.continuous.stress.delta",
        "temperature": "com.huawei.instantaneous.skin_temperature",
    }

    def __init__(self, oauth: OAuthManager, storage: Storage):
        self.settings = get_settings()
        self.oauth = oauth
        self.storage = storage
        self._client: Optional[httpx.AsyncClient] = None
        self._rate_limiter = RateLimiter(self.settings.huawei_rate_limit_per_minute)

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.settings.huawei_api_base_url, timeout=30.0
            )
        return self._client

    async def close(self) -> None:
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _request_with_retries(
        self,
        method: str,
        path: str,
        headers: Dict[str, str],
        json_payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Perform an API request with rate limiting and bounded retries.

        Retries transient failures (429/5xx) with exponential backoff,
        honoring Retry-After when present.
        """
        client = await self._get_client()
        attempts = self.settings.huawei_max_retries + 1
        last_error: Optional[HuaweiAPIError] = None

        for attempt in range(attempts):
            await self._rate_limiter.acquire()
            response = await client.request(
                method, path, json=json_payload, headers=headers
            )

            if response.status_code == 200:
                return response.json()

            error_data = (
                response.json()
                if response.headers.get("content-type", "").startswith(
                    "application/json"
                )
                else {}
            )
            last_error = HuaweiAPIError(
                error_data.get(
                    "error_description", f"API error: {response.status_code}"
                ),
                status_code=response.status_code,
                error_code=error_data.get("error"),
            )

            retryable = response.status_code in RETRYABLE_STATUS_CODES
            if not retryable or attempt >= attempts - 1:
                break

            retry_after = response.headers.get("Retry-After")
            delay = (
                float(retry_after)
                if retry_after and retry_after.isdigit()
                else self.settings.huawei_retry_backoff_seconds * (2**attempt)
            )
            logger.warning(
                "Huawei API transient failure status=%s attempt=%d/%d retrying in %.1fs",
                response.status_code,
                attempt + 1,
                attempts,
                delay,
            )
            await asyncio.sleep(delay)

        raise last_error if last_error else HuaweiAPIError("API request failed")

    async def _get_headers(self) -> Dict[str, str]:
        """Get headers with valid access token."""
        token = await self.oauth.get_valid_token()
        if not token:
            raise HuaweiAPIError(
                "Not authenticated. Please complete OAuth flow.", status_code=401
            )

        return {
            "Authorization": f"Bearer {token.access_token}",
            "Content-Type": "application/json",
        }

    async def _polymerize_data(
        self,
        data_type: str,
        start_time: datetime,
        end_time: datetime,
        aggregate_type: str = "daily",
    ) -> Dict[str, Any]:
        """
        Call sampleSet:polymerize endpoint for aggregated data.

        Args:
            data_type: Huawei data type name (e.g., com.huawei.continuous.steps.delta)
            start_time: Start datetime
            end_time: End datetime
            aggregate_type: Aggregation type (daily, hourly, etc.)

        Returns:
            Aggregated data response
        """
        headers = await self._get_headers()

        payload = {
            "polymerizeData": [
                {
                    "dataTypeName": data_type,
                    "startTime": start_time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                    "endTime": end_time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                    "aggregateType": aggregate_type,
                }
            ]
        }

        return await self._request_with_retries(
            "POST", "/sampleSet:polymerize", headers, payload
        )

    async def _read_data_records(
        self, data_type: str, start_time: datetime, end_time: datetime
    ) -> Dict[str, Any]:
        """
        Call dataRecord endpoint for detailed health records.

        Args:
            data_type: Huawei data type name
            start_time: Start datetime
            end_time: End datetime

        Returns:
            Detailed data records
        """
        headers = await self._get_headers()

        payload = {
            "dataTypeName": [data_type],
            "startTime": start_time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "endTime": end_time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        }

        return await self._request_with_retries("POST", "/dataRecord", headers, payload)

    # --- Health Data Methods ---

    async def get_steps(self, target_date: date) -> Dict[str, Any]:
        """
        Get step count, distance, and calories for a date.

        Args:
            target_date: Date to query

        Returns:
            Steps data
        """
        date_str = target_date.strftime("%Y-%m-%d")

        # Check cache first
        cached = await self.storage.get_cached_data("steps", date_str)
        if cached:
            return cached

        start_time = datetime.combine(target_date, datetime.min.time())
        end_time = datetime.combine(target_date, datetime.max.time())

        try:
            data = await self._polymerize_data(
                self.DATA_TYPES["steps"], start_time, end_time, "daily"
            )

            # Cache the result
            await self.storage.set_cached_data(
                "steps", date_str, data, self.settings.cache_ttl_seconds
            )

            return data
        except HuaweiAPIError:
            raise

    async def get_heart_rate(
        self, target_date: date, hr_type: str = "all"
    ) -> Dict[str, Any]:
        """
        Get heart rate data for a date.

        Args:
            target_date: Date to query
            hr_type: Type of heart rate data (instantaneous, continuous, resting, exercise, all)

        Returns:
            Heart rate data
        """
        date_str = target_date.strftime("%Y-%m-%d")
        cache_key = f"heart_rate_{hr_type}"

        cached = await self.storage.get_cached_data(cache_key, date_str)
        if cached:
            return cached

        start_time = datetime.combine(target_date, datetime.min.time())
        end_time = datetime.combine(target_date, datetime.max.time())

        results = {}

        try:
            if hr_type in ["instantaneous", "all"]:
                results["instantaneous"] = await self._read_data_records(
                    self.DATA_TYPES["heart_rate_instant"], start_time, end_time
                )

            if hr_type in ["continuous", "all"]:
                results["continuous"] = await self._read_data_records(
                    self.DATA_TYPES["heart_rate_continuous"], start_time, end_time
                )

            await self.storage.set_cached_data(
                cache_key, date_str, results, self.settings.cache_ttl_seconds
            )

            return results
        except HuaweiAPIError:
            raise

    async def get_sleep(self, target_date: date) -> Dict[str, Any]:
        """
        Get sleep data for a date.

        Args:
            target_date: Date to query (sleep from previous night)

        Returns:
            Sleep data
        """
        date_str = target_date.strftime("%Y-%m-%d")

        cached = await self.storage.get_cached_data("sleep", date_str)
        if cached:
            return cached

        # Sleep data typically covers from previous evening to morning
        start_time = datetime.combine(target_date, datetime.min.time())
        end_time = datetime.combine(target_date, datetime.max.time())

        try:
            data = await self._read_data_records(
                self.DATA_TYPES["sleep"], start_time, end_time
            )

            await self.storage.set_cached_data(
                "sleep", date_str, data, self.settings.cache_ttl_seconds
            )

            return data
        except HuaweiAPIError:
            raise

    async def get_spo2(self, target_date: date) -> Dict[str, Any]:
        """
        Get SpO2 (blood oxygen) data for a date.

        Args:
            target_date: Date to query

        Returns:
            SpO2 data
        """
        date_str = target_date.strftime("%Y-%m-%d")

        cached = await self.storage.get_cached_data("spo2", date_str)
        if cached:
            return cached

        start_time = datetime.combine(target_date, datetime.min.time())
        end_time = datetime.combine(target_date, datetime.max.time())

        try:
            # Get both continuous and instantaneous readings
            continuous = await self._read_data_records(
                self.DATA_TYPES["spo2_continuous"], start_time, end_time
            )
            instant = await self._read_data_records(
                self.DATA_TYPES["spo2_instant"], start_time, end_time
            )

            data = {"continuous": continuous, "instantaneous": instant}

            await self.storage.set_cached_data(
                "spo2", date_str, data, self.settings.cache_ttl_seconds
            )

            return data
        except HuaweiAPIError:
            raise

    async def get_stress(self, target_date: date) -> Dict[str, Any]:
        """
        Get stress data for a date.

        Args:
            target_date: Date to query

        Returns:
            Stress data
        """
        date_str = target_date.strftime("%Y-%m-%d")

        cached = await self.storage.get_cached_data("stress", date_str)
        if cached:
            return cached

        start_time = datetime.combine(target_date, datetime.min.time())
        end_time = datetime.combine(target_date, datetime.max.time())

        try:
            data = await self._read_data_records(
                self.DATA_TYPES["stress"], start_time, end_time
            )

            await self.storage.set_cached_data(
                "stress", date_str, data, self.settings.cache_ttl_seconds
            )

            return data
        except HuaweiAPIError:
            raise

    async def get_temperature(self, target_date: date) -> Dict[str, Any]:
        """
        Get skin temperature data for a date.

        Args:
            target_date: Date to query

        Returns:
            Temperature data
        """
        date_str = target_date.strftime("%Y-%m-%d")

        cached = await self.storage.get_cached_data("temperature", date_str)
        if cached:
            return cached

        start_time = datetime.combine(target_date, datetime.min.time())
        end_time = datetime.combine(target_date, datetime.max.time())

        try:
            data = await self._read_data_records(
                self.DATA_TYPES["temperature"], start_time, end_time
            )

            await self.storage.set_cached_data(
                "temperature", date_str, data, self.settings.cache_ttl_seconds
            )

            return data
        except HuaweiAPIError:
            raise

    async def get_ecg(self, target_date: date) -> Dict[str, Any]:
        """
        Get ECG data for a date.

        Args:
            target_date: Date to query

        Returns:
            ECG data
        """
        date_str = target_date.strftime("%Y-%m-%d")

        cached = await self.storage.get_cached_data("ecg", date_str)
        if cached:
            return cached

        # ECG uses a different endpoint or data type
        # This is a placeholder - actual implementation may differ
        start_time = datetime.combine(target_date, datetime.min.time())
        end_time = datetime.combine(target_date, datetime.max.time())

        try:
            data = await self._read_data_records("com.huawei.ecg", start_time, end_time)

            await self.storage.set_cached_data(
                "ecg", date_str, data, self.settings.cache_ttl_seconds
            )

            return data
        except HuaweiAPIError:
            raise

    async def get_workouts(
        self,
        target_date: Optional[date] = None,
        workout_type: Optional[str] = None,
        limit: int = 10,
    ) -> Dict[str, Any]:
        """
        Get workout history.

        Args:
            target_date: Optional date filter
            workout_type: Optional workout type filter
            limit: Maximum number of results

        Returns:
            Workout data
        """
        # Workouts might use a different endpoint
        # This is a simplified implementation
        cache_key = f"workouts_{target_date or 'all'}_{workout_type or 'all'}"
        today = date.today().strftime("%Y-%m-%d")

        cached = await self.storage.get_cached_data(cache_key, today)
        if cached:
            return cached

        # Placeholder - actual implementation depends on Huawei's workout endpoint
        data = {"workouts": [], "limit": limit}

        return data

    async def get_health_summary(self, target_date: date) -> Dict[str, Any]:
        """
        Get comprehensive health summary for a date.

        Args:
            target_date: Date to query

        Returns:
            Combined health summary
        """
        date_str = target_date.strftime("%Y-%m-%d")

        cached = await self.storage.get_cached_data("summary", date_str)
        if cached:
            return cached

        # Aggregate data from all sources
        summary = {
            "date": date_str,
            "steps": None,
            "heart_rate": None,
            "sleep": None,
            "spo2": None,
            "stress": None,
            "temperature": None,
        }

        # Try to get each data type, but don't fail if one is missing
        errors = []

        try:
            summary["steps"] = await self.get_steps(target_date)
        except Exception as e:
            errors.append(f"steps: {str(e)}")

        try:
            summary["heart_rate"] = await self.get_heart_rate(target_date)
        except Exception as e:
            errors.append(f"heart_rate: {str(e)}")

        try:
            summary["sleep"] = await self.get_sleep(target_date)
        except Exception as e:
            errors.append(f"sleep: {str(e)}")

        try:
            summary["spo2"] = await self.get_spo2(target_date)
        except Exception as e:
            errors.append(f"spo2: {str(e)}")

        try:
            summary["stress"] = await self.get_stress(target_date)
        except Exception as e:
            errors.append(f"stress: {str(e)}")

        try:
            summary["temperature"] = await self.get_temperature(target_date)
        except Exception as e:
            errors.append(f"temperature: {str(e)}")

        if errors:
            summary["_errors"] = errors

        await self.storage.set_cached_data(
            "summary", date_str, summary, self.settings.cache_ttl_seconds
        )

        return summary
