import json

import httpx
import redis.asyncio as aioredis

from config import settings

SKIP_ROLES = {"CUSTOMER", "AUDITOR"}
DIRECTORY_CACHE_KEY = "staff_directory"


async def fetch_staff_directory(client: httpx.AsyncClient, token: str, request_id: str) -> dict[str, str]:
    try:
        resp = await client.get(
            f"{settings.auth_service_url}/users/all",
            headers={"Authorization": f"Bearer {token}", "X-Request-ID": request_id},
            timeout=5.0,
        )
    except httpx.HTTPError:
        return {}
    if not resp.is_success:
        return {}
    return {u["id"]: (u.get("full_name") or u["email"]) for u in resp.json()}


async def get_staff_directory(
    client: httpx.AsyncClient, redis: aioredis.Redis, token: str, request_id: str
) -> dict[str, str]:
    """Staff id → display name, cached in Redis so staff views don't call auth-service on every request."""
    cached = await redis.get(DIRECTORY_CACHE_KEY)
    if cached:
        return json.loads(cached)
    directory = await fetch_staff_directory(client, token, request_id)
    if directory:
        await redis.setex(DIRECTORY_CACHE_KEY, settings.redis_cache_ttl, json.dumps(directory))
    return directory
