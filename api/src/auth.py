"""
OAuth authentication module for Huawei Health Kit.
Implements authorization code flow with automatic token refresh.
"""

import httpx
import base64
import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple
from urllib.parse import urlencode

from .config import get_settings
from .storage import Storage

logger = logging.getLogger(__name__)

# Default timeout for OAuth token endpoint calls (seconds).
OAUTH_TIMEOUT_SECONDS = 15.0


class OAuthError(Exception):
    """OAuth-related error."""

    def __init__(self, message: str, code: Optional[str] = None):
        super().__init__(message)
        self.code = code


class TokenData:
    """OAuth token data."""

    def __init__(
        self,
        access_token: str,
        refresh_token: str,
        expires_in: int,
        token_type: str = "Bearer",
        expires_at: Optional[datetime] = None,
    ):
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.expires_in = expires_in
        self.token_type = token_type
        self.expires_at = expires_at or datetime.utcnow() + timedelta(
            seconds=expires_in - 60
        )

    def is_expired(self) -> bool:
        """Check if token is expired."""
        return datetime.utcnow() >= self.expires_at

    def to_dict(self) -> dict:
        """Convert to dictionary for storage."""
        return {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "expires_in": self.expires_in,
            "token_type": self.token_type,
            "expires_at": self.expires_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TokenData":
        """Create from dictionary."""
        return cls(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_in=data["expires_in"],
            token_type=data.get("token_type", "Bearer"),
            expires_at=datetime.fromisoformat(data["expires_at"])
            if "expires_at" in data
            else None,
        )


class OAuthManager:
    """Manages OAuth flow for Huawei Health Kit."""

    def __init__(self, storage: Storage):
        self.settings = get_settings()
        self.storage = storage
        self._token: Optional[TokenData] = None

    def _auth_header(self) -> str:
        """Build the Basic Auth header for token endpoint requests."""
        credentials = (
            f"{self.settings.huawei_client_id}:{self.settings.huawei_client_secret}"
        )
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded_credentials}"

    async def _token_request(self, data: dict) -> dict:
        """
        Perform a token endpoint request with a bounded timeout.

        Shared by the authorization-code and refresh-token grants.

        Raises:
            OAuthError: On network failure or non-200 response.
        """
        try:
            async with httpx.AsyncClient(timeout=OAUTH_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    self.settings.huawei_token_url,
                    data=data,
                    headers={
                        "Authorization": self._auth_header(),
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                )
        except httpx.HTTPError as exc:
            logger.error("Huawei token endpoint unreachable: %s", exc)
            raise OAuthError(
                f"Token endpoint request failed: {exc}", code="network_error"
            ) from exc

        if response.status_code != 200:
            error_data = (
                response.json()
                if response.headers.get("content-type", "").startswith(
                    "application/json"
                )
                else {}
            )
            logger.warning(
                "Huawei token endpoint rejected request: status=%s error=%s",
                response.status_code,
                error_data.get("error"),
            )
            raise OAuthError(
                error_data.get(
                    "error_description", f"Token request failed: {response.status_code}"
                ),
                code=error_data.get("error"),
            )

        return response.json()

    def get_authorization_url(self, state: Optional[str] = None) -> str:
        """
        Generate the authorization URL for the OAuth flow.

        Returns:
            Authorization URL to redirect the user to.
        """
        params = {
            "client_id": self.settings.huawei_client_id,
            "redirect_uri": self.settings.huawei_redirect_uri,
            "response_type": "code",
            "scope": self.settings.huawei_scope,
        }
        if state:
            params["state"] = state

        query_string = urlencode(params)
        return f"{self.settings.huawei_auth_url}?{query_string}"

    async def exchange_code_for_token(self, code: str) -> TokenData:
        """
        Exchange authorization code for access token.

        Args:
            code: Authorization code from callback.

        Returns:
            TokenData with access and refresh tokens.

        Raises:
            OAuthError: If token exchange fails.
        """
        token_data = await self._token_request(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self.settings.huawei_redirect_uri,
            }
        )

        token = TokenData(
            access_token=token_data["access_token"],
            refresh_token=token_data["refresh_token"],
            expires_in=token_data["expires_in"],
            token_type=token_data.get("token_type", "Bearer"),
        )

        # Store token
        await self.storage.save_token(token.to_dict())
        self._token = token

        return token

    async def refresh_access_token(self, refresh_token: str) -> TokenData:
        """
        Refresh the access token using a refresh token.

        Args:
            refresh_token: The refresh token.

        Returns:
            New TokenData with fresh access token.

        Raises:
            OAuthError: If token refresh fails.
        """
        token_data = await self._token_request(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            }
        )

        token = TokenData(
            access_token=token_data["access_token"],
            refresh_token=token_data.get(
                "refresh_token", refresh_token
            ),  # Some providers return new refresh token
            expires_in=token_data["expires_in"],
            token_type=token_data.get("token_type", "Bearer"),
        )

        # Store updated token
        await self.storage.save_token(token.to_dict())
        self._token = token

        return token

    async def get_valid_token(self) -> Optional[TokenData]:
        """
        Get a valid access token, refreshing if necessary.

        Returns:
            Valid TokenData or None if no token available.
        """
        # Check in-memory cache first
        if self._token and not self._token.is_expired():
            return self._token

        # Load from storage
        stored_token = await self.storage.get_token()
        if not stored_token:
            return None

        token = TokenData.from_dict(stored_token)

        # Refresh if expired
        if token.is_expired():
            try:
                token = await self.refresh_access_token(token.refresh_token)
            except OAuthError:
                # Token refresh failed, need re-auth
                await self.storage.delete_token()
                return None

        self._token = token
        return token

    async def is_authenticated(self) -> bool:
        """Check if user is authenticated with valid token."""
        token = await self.get_valid_token()
        return token is not None

    async def logout(self) -> None:
        """Clear stored tokens."""
        self._token = None
        await self.storage.delete_token()
