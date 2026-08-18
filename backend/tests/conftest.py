import os
import requests
import pytest
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://companion-compass.preview.emergentagent.com").rstrip("/")
TEST_TOKEN = "test-session-lifeos-fixture-0001"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def auth_headers():
    return {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_client(auth_headers):
    s = requests.Session()
    s.headers.update(auth_headers)
    return s
