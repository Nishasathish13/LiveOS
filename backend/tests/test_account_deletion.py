"""Tests for the new DELETE /api/account endpoint.

We intentionally use a throwaway user + session (created directly in MongoDB) so
the fixture user token remains valid for the regression suite.
"""
import os
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://companion-compass.preview.emergentagent.com"
).rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

THROWAWAY_USER_ID = "user_deletetest01"
THROWAWAY_EMAIL = "lifeos.deletetest@example.com"
THROWAWAY_TOKEN = "test-session-delete-throwaway-0001"

OTHER_USER_ID = "user_isolationtest01"
OTHER_EMAIL = "lifeos.isolation@example.com"
OTHER_TOKEN = "test-session-isolation-0002"


async def _seed_user(user_id: str, email: str, token: str):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    now = datetime.now(timezone.utc)
    await db.users.replace_one(
        {"user_id": user_id},
        {
            "user_id": user_id,
            "email": email,
            "name": "Throwaway",
            "picture": None,
            "created_at": now.isoformat(),
            "tone": "gentle companion",
        },
        upsert=True,
    )
    await db.user_sessions.replace_one(
        {"session_token": token},
        {
            "session_token": token,
            "user_id": user_id,
            "created_at": now,
            "expires_at": now + timedelta(days=365),
        },
        upsert=True,
    )
    client.close()


async def _cleanup_user(user_id: str):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    for c in ["profiles", "domains", "daily_logs", "tasks",
              "reflection_summaries", "companion_messages",
              "roadmap_suggestions", "companion_feedback"]:
        await db[c].delete_many({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.users.delete_one({"user_id": user_id})
    client.close()


async def _count_user_docs(user_id: str) -> dict:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    counts = {}
    for c in ["profiles", "domains", "daily_logs", "tasks",
              "reflection_summaries", "companion_messages",
              "roadmap_suggestions", "companion_feedback",
              "user_sessions", "users"]:
        field = "user_id"
        counts[c] = await db[c].count_documents({field: user_id})
    client.close()
    return counts


@pytest.fixture()
def throwaway_client():
    asyncio.run(_seed_user(THROWAWAY_USER_ID, THROWAWAY_EMAIL, THROWAWAY_TOKEN))
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {THROWAWAY_TOKEN}",
        "Content-Type": "application/json",
    })
    yield s
    # Best-effort cleanup in case a test aborted mid-flow
    asyncio.run(_cleanup_user(THROWAWAY_USER_ID))


@pytest.fixture()
def other_user_client():
    asyncio.run(_seed_user(OTHER_USER_ID, OTHER_EMAIL, OTHER_TOKEN))
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {OTHER_TOKEN}",
        "Content-Type": "application/json",
    })
    yield s
    asyncio.run(_cleanup_user(OTHER_USER_ID))


class TestAccountDeletionAuth:
    def test_delete_requires_auth(self):
        r = requests.delete(f"{BASE_URL}/api/account")
        assert r.status_code == 401

    def test_delete_with_garbage_token_401(self):
        r = requests.delete(
            f"{BASE_URL}/api/account",
            headers={"Authorization": "Bearer garbage-xyz"},
        )
        assert r.status_code == 401


class TestAccountDeletionFlow:
    def test_seed_data_then_delete_wipes_everything(self, throwaway_client):
        # Seed profile via /onboard/commit
        commit = throwaway_client.post(
            f"{BASE_URL}/api/onboard/commit",
            json={
                "northStar": "Throwaway north star.",
                "companionTone": "gentle companion",
                "domains": [
                    {"name": "TEST_Del_Sleep", "targetFrequency": 5, "goals": ["sleep 8h"]},
                    {"name": "TEST_Del_Move", "targetFrequency": 3, "goals": ["walk"]},
                ],
            },
        )
        assert commit.status_code == 200

        # Seed a daily log
        log = throwaway_client.post(
            f"{BASE_URL}/api/logs",
            json={
                "date": "2026-01-08",
                "activities": "TEST_del walked",
                "moodScore": 4,
                "sleepHours": 7.0,
                "domainsTouched": [],
                "isRestDay": False,
            },
        )
        assert log.status_code == 200

        # Seed a task
        task = throwaway_client.post(
            f"{BASE_URL}/api/tasks",
            json={"title": "TEST_del task", "dueDate": None, "domainId": None, "done": False},
        )
        assert task.status_code == 200

        # Confirm data exists before deletion
        before = asyncio.run(_count_user_docs(THROWAWAY_USER_ID))
        assert before["users"] == 1
        assert before["user_sessions"] >= 1
        assert before["profiles"] == 1
        assert before["domains"] == 2
        assert before["daily_logs"] >= 1
        assert before["tasks"] >= 1

        # Verify workspace works before delete
        ws = throwaway_client.get(f"{BASE_URL}/api/workspace")
        assert ws.status_code == 200

        # DELETE account
        d = throwaway_client.delete(f"{BASE_URL}/api/account")
        assert d.status_code == 200
        assert d.json() == {"ok": True}

        # All user-scoped rows must be gone
        after = asyncio.run(_count_user_docs(THROWAWAY_USER_ID))
        for key, cnt in after.items():
            assert cnt == 0, f"Collection {key} still has {cnt} rows for deleted user"

        # Same token must now be rejected (session deleted)
        me = throwaway_client.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 401

        ws2 = throwaway_client.get(f"{BASE_URL}/api/workspace")
        assert ws2.status_code == 401


class TestAccountDeletionIsolation:
    def test_delete_does_not_touch_other_users(self, throwaway_client, other_user_client):
        # Seed data for BOTH users
        for c in (throwaway_client, other_user_client):
            commit = c.post(
                f"{BASE_URL}/api/onboard/commit",
                json={
                    "northStar": "iso ns",
                    "companionTone": "gentle companion",
                    "domains": [
                        {"name": "TEST_Iso_A", "targetFrequency": 3, "goals": ["a"]},
                    ],
                },
            )
            assert commit.status_code == 200
            log = c.post(
                f"{BASE_URL}/api/logs",
                json={
                    "date": "2026-01-09",
                    "activities": "iso",
                    "moodScore": 3,
                    "sleepHours": 6.5,
                    "domainsTouched": [],
                    "isRestDay": False,
                },
            )
            assert log.status_code == 200
            t = c.post(
                f"{BASE_URL}/api/tasks",
                json={"title": "TEST_iso task", "dueDate": None, "domainId": None, "done": False},
            )
            assert t.status_code == 200

        # Delete throwaway account
        d = throwaway_client.delete(f"{BASE_URL}/api/account")
        assert d.status_code == 200

        # Other user data must remain untouched
        other_counts = asyncio.run(_count_user_docs(OTHER_USER_ID))
        assert other_counts["users"] == 1
        assert other_counts["user_sessions"] >= 1
        assert other_counts["profiles"] == 1
        assert other_counts["domains"] == 1
        assert other_counts["daily_logs"] >= 1
        assert other_counts["tasks"] >= 1

        # Other user's session/token must still work
        me = other_user_client.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200
        assert me.json()["user_id"] == OTHER_USER_ID
        ws = other_user_client.get(f"{BASE_URL}/api/workspace")
        assert ws.status_code == 200
        names = [d["name"] for d in ws.json()["domains"]]
        assert "TEST_Iso_A" in names
