"""Seed a deterministic test user + long-lived session for automated testing.

Run: python seed_test_user.py
The printed session_token is written to /app/memory/test_credentials.md by the agent.
"""
import asyncio
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

TEST_USER_ID = "user_testfixture01"
TEST_EMAIL = "lifeos.tester@example.com"
TEST_TOKEN = "test-session-lifeos-fixture-0001"


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)
    user = {
        "user_id": TEST_USER_ID,
        "email": TEST_EMAIL,
        "name": "Test Explorer",
        "picture": None,
        "created_at": now.isoformat(),
        "tone": "gentle companion",
    }
    await db.users.replace_one({"user_id": TEST_USER_ID}, user, upsert=True)
    session = {
        "session_token": TEST_TOKEN,
        "user_id": TEST_USER_ID,
        "created_at": now,
        "expires_at": now + timedelta(days=3650),
    }
    await db.user_sessions.replace_one({"session_token": TEST_TOKEN}, session, upsert=True)
    print(f"Seeded test user {TEST_EMAIL}")
    print(f"SESSION_TOKEN={TEST_TOKEN}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
