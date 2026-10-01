import json

import httpx
import redis.asyncio as aioredis

from config import settings
from models.schemas import StaffMember

SKIP_ROLES = {"CUSTOMER", "AUDITOR"}
# v2: entries carry the role as well as the name (v1 cached the bare name).
DIRECTORY_CACHE_KEY = "staff_directory:v2"

Directory = dict[str, StaffMember]


async def fetch_staff_directory(client: httpx.AsyncClient, token: str, request_id: str) -> Directory:
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
    return {
        u["id"]: StaffMember(name=u.get("full_name") or u["email"], role=u.get("role") or "")
        for u in resp.json()
    }


async def get_staff_directory(
    client: httpx.AsyncClient, redis: aioredis.Redis, token: str, request_id: str, refresh: bool = False
) -> Directory:
    """User id → name and role, cached in Redis so staff views don't call auth-service on every request.

    `refresh` skips the cached copy, for a lookup that missed and may simply be stale.
    """
    cached = None if refresh else await redis.get(DIRECTORY_CACHE_KEY)
    if cached:
        return {uid: StaffMember(**member) for uid, member in json.loads(cached).items()}
    directory = await fetch_staff_directory(client, token, request_id)
    if directory:
        payload = {uid: member.model_dump() for uid, member in directory.items()}
        await redis.setex(DIRECTORY_CACHE_KEY, settings.redis_cache_ttl, json.dumps(payload))
    return directory
