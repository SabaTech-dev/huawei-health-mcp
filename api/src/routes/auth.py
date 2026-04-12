"""
Authentication routes for OAuth flow.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from ..auth import OAuthManager, OAuthError
from ..main import get_oauth_manager

router = APIRouter()


class AuthorizeResponse(BaseModel):
    """Response with authorization URL."""
    authorization_url: str
    state: str | None = None


class OAuthCallbackRequest(BaseModel):
    """Request model for OAuth callback (POST variant)."""
    code: str


class RefreshTokenRequest(BaseModel):
    """Request model for token refresh."""
    refresh_token: str


@router.get("/authorize", response_model=AuthorizeResponse)
async def get_authorize_url(
    state: str | None = None,
    oauth: OAuthManager = Depends(get_oauth_manager)
):
    """
    Get the authorization URL to start OAuth flow.
    
    Redirect the user to this URL to authenticate with Huawei.
    """
    auth_url = oauth.get_authorization_url(state)
    return AuthorizeResponse(authorization_url=auth_url, state=state)


@router.get("/callback")
async def oauth_callback(
    code: str,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    oauth: OAuthManager = Depends(get_oauth_manager)
):
    """
    OAuth callback endpoint.
    
    Handles the callback from Huawei OAuth after user authorizes.
    """
    if error:
        raise HTTPException(
            status_code=400,
            detail={"error": error, "description": error_description}
        )
    
    try:
        token = await oauth.exchange_code_for_token(code)
        return {
            "status": "success",
            "message": "Authentication successful",
            "token_type": token.token_type,
            "expires_in": token.expires_in
        }
    except OAuthError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/callback")
async def oauth_callback_post(
    request: OAuthCallbackRequest,
    oauth: OAuthManager = Depends(get_oauth_manager)
):
    """
    OAuth callback endpoint (POST variant).
    
    Handles the callback from Huawei OAuth with authorization code.
    """
    try:
        token = await oauth.exchange_code_for_token(request.code)
        return {
            "status": "success",
            "message": "Authentication successful",
            "token_type": token.token_type,
            "expires_in": token.expires_in
        }
    except OAuthError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/refresh")
async def refresh_token(
    request: RefreshTokenRequest,
    oauth: OAuthManager = Depends(get_oauth_manager)
):
    """
    Refresh access token.
    
    Use a refresh token to get a new access token.
    """
    try:
        token = await oauth.refresh_access_token(request.refresh_token)
        return {
            "status": "success",
            "token_type": token.token_type,
            "expires_in": token.expires_in
        }
    except OAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.get("/status")
async def auth_status(
    oauth: OAuthManager = Depends(get_oauth_manager)
):
    """
    Check authentication status.
    
    Returns whether the user is currently authenticated.
    """
    is_authenticated = await oauth.is_authenticated()
    return {
        "authenticated": is_authenticated
    }


@router.post("/logout")
async def logout(
    oauth: OAuthManager = Depends(get_oauth_manager)
):
    """
    Logout and revoke tokens.
    
    Clears stored authentication tokens.
    """
    await oauth.logout()
    return {"status": "success", "message": "Logged out successfully"}
