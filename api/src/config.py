"""
Configuration settings for Huawei Health MCP Backend API.
All settings are loaded from environment variables.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # App settings
    app_name: str = "Huawei Health MCP API"
    app_version: str = "0.1.0"
    debug: bool = False
    
    # Server settings
    host: str = "0.0.0.0"
    port: int = 8080
    
    # Huawei OAuth settings
    huawei_client_id: str = ""
    huawei_client_secret: str = ""
    huawei_redirect_uri: str = "http://localhost:8080/api/v1/auth/callback"
    
    # Huawei API settings
    huawei_api_base_url: str = "https://health-api.cloud.huawei.com/healthkit/v1"
    huawei_auth_url: str = "https://oauth-login.cloud.huawei.com/oauth2/v3/authorize"
    huawei_token_url: str = "https://oauth-login.cloud.huawei.com/oauth2/v3/token"
    huawei_scope: str = "https://www.huawei.com/healthkit"
    
    # Database settings
    database_url: str = "sqlite+aiosqlite:////data/huawei-health/health_data.db"
    
    # API authentication
    api_token: Optional[str] = None
    
    # Cache settings
    cache_ttl_seconds: int = 300  # 5 minutes
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
