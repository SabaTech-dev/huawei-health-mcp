"""
SQLite storage module for caching health data and OAuth tokens.
"""

import aiosqlite
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, Any, Dict, List

from .config import get_settings


class Storage:
    """Async SQLite storage for health data and tokens."""
    
    def __init__(self, db_path: Optional[str] = None):
        settings = get_settings()
        self.db_path = db_path or settings.database_url.replace("sqlite+aiosqlite:///", "")
        self._db: Optional[aiosqlite.Connection] = None
    
    async def connect(self) -> None:
        """Connect to the database and create tables if needed."""
        # Ensure directory exists
        db_file = Path(self.db_path)
        db_file.parent.mkdir(parents=True, exist_ok=True)
        
        self._db = await aiosqlite.connect(self.db_path)
        await self._create_tables()
    
    async def disconnect(self) -> None:
        """Disconnect from the database."""
        if self._db:
            await self._db.close()
            self._db = None
    
    async def _create_tables(self) -> None:
        """Create necessary tables."""
        await self._db.executescript("""
            -- OAuth tokens table
            CREATE TABLE IF NOT EXISTS oauth_tokens (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                access_token TEXT NOT NULL,
                refresh_token TEXT NOT NULL,
                expires_in INTEGER NOT NULL,
                token_type TEXT DEFAULT 'Bearer',
                expires_at TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Health data cache table
            CREATE TABLE IF NOT EXISTS health_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data_type TEXT NOT NULL,
                date TEXT NOT NULL,
                data_json TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                expires_at TEXT NOT NULL,
                UNIQUE(data_type, date)
            );
            
            -- Create index for faster lookups
            CREATE INDEX IF NOT EXISTS idx_health_cache_type_date ON health_cache(data_type, date);
            CREATE INDEX IF NOT EXISTS idx_health_cache_expires ON health_cache(expires_at);
        """)
        await self._db.commit()
    
    # --- Token Methods ---
    
    async def save_token(self, token_data: Dict[str, Any]) -> None:
        """Save OAuth token data."""
        await self._db.execute(
            """
            INSERT OR REPLACE INTO oauth_tokens 
            (id, access_token, refresh_token, expires_in, token_type, expires_at, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                token_data["access_token"],
                token_data["refresh_token"],
                token_data["expires_in"],
                token_data.get("token_type", "Bearer"),
                token_data["expires_at"]
            )
        )
        await self._db.commit()
    
    async def get_token(self) -> Optional[Dict[str, Any]]:
        """Get stored OAuth token data."""
        async with self._db.execute("SELECT * FROM oauth_tokens WHERE id = 1") as cursor:
            row = await cursor.fetchone()
            if row:
                return {
                    "access_token": row[1],
                    "refresh_token": row[2],
                    "expires_in": row[3],
                    "token_type": row[4],
                    "expires_at": row[5]
                }
            return None
    
    async def delete_token(self) -> None:
        """Delete stored OAuth token."""
        await self._db.execute("DELETE FROM oauth_tokens WHERE id = 1")
        await self._db.commit()
    
    # --- Cache Methods ---
    
    async def get_cached_data(self, data_type: str, date: str) -> Optional[Dict[str, Any]]:
        """
        Get cached health data if not expired.
        
        Args:
            data_type: Type of health data (e.g., 'heart_rate', 'steps')
            date: Date string in YYYY-MM-DD format
            
        Returns:
            Cached data or None if not found/expired
        """
        async with self._db.execute(
            """
            SELECT data_json FROM health_cache 
            WHERE data_type = ? AND date = ? AND expires_at > CURRENT_TIMESTAMP
            """,
            (data_type, date)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return json.loads(row[0])
            return None
    
    async def set_cached_data(
        self, 
        data_type: str, 
        date: str, 
        data: Dict[str, Any], 
        ttl_seconds: int = 300
    ) -> None:
        """
        Cache health data.
        
        Args:
            data_type: Type of health data
            date: Date string in YYYY-MM-DD format
            data: Data to cache
            ttl_seconds: Time to live in seconds
        """
        await self._db.execute(
            """
            INSERT OR REPLACE INTO health_cache (data_type, date, data_json, expires_at)
            VALUES (?, ?, ?, datetime('now', '+' || ? || ' seconds'))
            """,
            (data_type, date, json.dumps(data), ttl_seconds)
        )
        await self._db.commit()
    
    async def clear_expired_cache(self) -> int:
        """Clear expired cache entries. Returns count of deleted rows."""
        cursor = await self._db.execute(
            "DELETE FROM health_cache WHERE expires_at < CURRENT_TIMESTAMP"
        )
        await self._db.commit()
        return cursor.rowcount
    
    async def clear_all_cache(self) -> None:
        """Clear all cached data."""
        await self._db.execute("DELETE FROM health_cache")
        await self._db.commit()


# Global storage instance
_storage: Optional[Storage] = None


async def get_storage() -> Storage:
    """Get or create storage instance."""
    global _storage
    if _storage is None:
        _storage = Storage()
        await _storage.connect()
    return _storage


async def close_storage() -> None:
    """Close storage connection."""
    global _storage
    if _storage:
        await _storage.disconnect()
        _storage = None
