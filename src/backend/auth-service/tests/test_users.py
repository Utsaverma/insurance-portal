import pytest

from tests.conftest import CANNED_EMAIL, CANNED_PASSWORD


async def _login(client):
    resp = await client.post(
        "/auth/login",
        json={"email": CANNED_EMAIL, "password": CANNED_PASSWORD},
    )
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_get_me_returns_profile(client, registered_user):
    token = await _login(client)
    resp = await client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "CUSTOMER"


@pytest.mark.asyncio
async def test_get_me_without_token_returns_401(client):
    resp = await client.get("/users/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_patch_me_updates_name(client, registered_user):
    token = await _login(client)
    resp = await client.patch(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"full_name": "Jane Doe"},
    )
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Jane Doe"


@pytest.mark.asyncio
async def test_role_restricted_endpoint_returns_403(client, registered_user):
    token = await _login(client)
    resp = await client.get("/users/all", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
