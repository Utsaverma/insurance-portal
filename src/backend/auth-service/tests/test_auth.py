from datetime import timedelta

import pytest
from jose import jwt

from config import settings as _settings
from tests.conftest import CANNED_EMAIL, CANNED_PASSWORD
from services.auth_service import create_jwt


def _claims(token: str) -> dict:
    return jwt.decode(token, _settings.jwt_secret_key, algorithms=[_settings.jwt_algorithm])


@pytest.mark.asyncio
async def test_register_and_login(client):
    await client.post(
        "/auth/register",
        json={"email": "new@example.com", "password": "Password1!", "full_name": "New User"},
    )
    resp = await client.post(
        "/auth/login",
        json={"email": "new@example.com", "password": "Password1!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_access_token_carries_full_name(client, registered_user):
    resp = await client.post(
        "/auth/login",
        json={"email": CANNED_EMAIL, "password": CANNED_PASSWORD},
    )
    assert resp.status_code == 200
    assert _claims(resp.json()["access_token"])["full_name"] == "Test User"


@pytest.mark.asyncio
async def test_login_response_embeds_user(client, registered_user):
    resp = await client.post(
        "/auth/login",
        json={"email": CANNED_EMAIL, "password": CANNED_PASSWORD},
    )
    assert resp.status_code == 200
    assert resp.json()["user"]["full_name"] == "Test User"
    assert resp.json()["user"]["email"] == CANNED_EMAIL


@pytest.mark.asyncio
async def test_refresh_token_carries_no_pii(client, registered_user):
    """Minimality guard: the refresh token is a 7-day credential. Keep it bare."""
    resp = await client.post(
        "/auth/login",
        json={"email": CANNED_EMAIL, "password": CANNED_PASSWORD},
    )
    claims = _claims(resp.json()["refresh_token"])
    assert "email" not in claims
    assert "full_name" not in claims


@pytest.mark.asyncio
async def test_register_without_full_name_succeeds(client):
    """init.sql has full_name NOT NULL; the router must supply a fallback."""
    resp = await client.post(
        "/auth/register",
        json={"email": "nameless@example.com", "password": "Password1!"},
    )
    assert resp.status_code == 201
    assert resp.json()["full_name"] == "nameless"


@pytest.mark.asyncio
async def test_wrong_password_returns_401(client, registered_user):
    resp = await client.post(
        "/auth/login",
        json={"email": CANNED_EMAIL, "password": "WrongPass1!"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_returns_401(client, registered_user):
    from config import settings
    expired = create_jwt(
        {"sub": registered_user["id"], "email": CANNED_EMAIL, "role": "CUSTOMER", "type": "access"},
        timedelta(seconds=-1),
    )
    resp = await client.get("/users/me", headers={"Authorization": f"Bearer {expired}"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_rotates_tokens(client, registered_user):
    login = await client.post(
        "/auth/login",
        json={"email": CANNED_EMAIL, "password": CANNED_PASSWORD},
    )
    original_access = login.json()["access_token"]
    refresh_token = login.json()["refresh_token"]

    resp = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert resp.json()["access_token"] != original_access


@pytest.mark.asyncio
async def test_rate_limit_on_login(client, registered_user):
    responses = []
    for _ in range(11):
        r = await client.post(
            "/auth/login",
            json={"email": CANNED_EMAIL, "password": CANNED_PASSWORD},
        )
        responses.append(r.status_code)
    assert 429 in responses


@pytest.mark.asyncio
async def test_refresh_with_access_token_rejected(client, registered_user):
    login = await client.post(
        "/auth/login",
        json={"email": CANNED_EMAIL, "password": CANNED_PASSWORD},
    )
    access_token = login.json()["access_token"]
    resp = await client.post("/auth/refresh", json={"refresh_token": access_token})
    assert resp.status_code == 401
