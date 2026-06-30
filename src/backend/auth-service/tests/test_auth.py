from datetime import timedelta

import pytest

from tests.conftest import CANNED_EMAIL, CANNED_PASSWORD
from services.auth_service import create_jwt


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
