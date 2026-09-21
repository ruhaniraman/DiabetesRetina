"""The session token arrives as an HttpOnly cookie (browser) or a Bearer header (other clients); cookie POSTs need the CSRF header.
The auth-server is replaced by a fake, so nothing external is needed."""
import os
import subprocess
import sys

os.environ["DISABLE_MATLAB"] = "true"

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi import Depends, FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402

CSRF = {"X-Requested-With": "retina-rescue"}
seen = []


class FakeAuthClient:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, headers=None):
        seen.append(headers["Authorization"])
        ok = headers["Authorization"] == "Bearer good-token"
        return httpx.Response(200 if ok else 401, json={"user": {"id": 9, "email": "u@example.com"}} if ok else {})


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(server.httpx, "AsyncClient", FakeAuthClient)
    server._auth_cache.clear()
    seen.clear()
    app = FastAPI()

    @app.get("/read")
    async def read(user: dict = Depends(server.require_user)):
        return user

    @app.post("/write")
    async def write(user: dict = Depends(server.require_user)):
        return user

    return TestClient(app)


def test_no_token_is_401(client):
    assert client.get("/read").status_code == 401
    assert client.post("/write", headers=CSRF).status_code == 401


def test_cookie_authenticates_reads(client):
    client.cookies.set("rr_session", "good-token")
    r = client.get("/read")
    assert r.status_code == 200 and r.json()["id"] == 9
    assert seen == ["Bearer good-token"]          # forwarded to the auth-server as a Bearer token


def test_a_bad_cookie_is_401(client):
    client.cookies.set("rr_session", "bad-token")
    assert client.get("/read").status_code == 401


def test_cookie_post_needs_the_csrf_header(client):
    client.cookies.set("rr_session", "good-token")
    assert client.post("/write").status_code == 403
    assert client.post("/write", headers={"X-Requested-With": "something-else"}).status_code == 403
    assert client.post("/write", headers=CSRF).status_code == 200


def test_bearer_post_needs_no_header(client):
    assert client.post("/write", headers={"Authorization": "Bearer good-token"}).status_code == 200


def test_bearer_wins_over_cookie(client):
    client.cookies.set("rr_session", "bad-token")
    assert client.post("/write", headers={"Authorization": "Bearer good-token"}).status_code == 200


def test_cors_allows_credentials_for_the_web_app_only():
    c = TestClient(server.app)
    ok = c.options("/api/health", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-requested-with"})
    assert ok.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert ok.headers["access-control-allow-credentials"] == "true"
    other = c.options("/api/health", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in other.headers


def test_a_wildcard_origin_stops_the_server():
    r = subprocess.run([sys.executable, "-c", "import server"], env={**os.environ, "CLIENT_ORIGINS": "*"}, capture_output=True, text=True, cwd=os.path.dirname(server.__file__))
    assert r.returncode != 0 and "CLIENT_ORIGINS" in (r.stderr + r.stdout)
