"""Shared test isolation."""
import pytest


@pytest.fixture(autouse=True)
def _no_real_auth_server(monkeypatch):
    """Never reach a real auth-server from a test: a developer's backend/.env may hold a working SERVICE_KEY, and a test that records an exam
    would otherwise store a PDF against a real exam id. Tests that exercise saving set SERVICE_KEY and fake the calls themselves."""
    import server

    monkeypatch.setattr(server, "SERVICE_KEY", "")

    async def refuse(*_a, **_k):
        raise AssertionError("a test tried to reach the real auth-server")

    monkeypatch.setattr(server, "store_report", refuse)


@pytest.fixture(autouse=True)
def _empty_render_cache():
    """Tests fake MATLAB with different outputs for the same synthetic photo, so no render may carry over from another test."""
    import server

    server.render_cache.clear()
    yield
    server.render_cache.clear()
