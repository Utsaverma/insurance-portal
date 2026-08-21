import httpx

from config import settings

SKIP_ROLES = {"CUSTOMER", "AUDITOR"}


async def fetch_staff_directory(client: httpx.AsyncClient, token: str, request_id: str) -> dict[str, str]:
    try:
        resp = await client.get(
            f"{settings.auth_service_url}/users/all",
            headers={"Authorization": f"Bearer {token}", "X-Request-ID": request_id},
            timeout=5.0,
        )
    except httpx.TimeoutException:
        return {}
    if not resp.is_success:
        return {}
    return {u["id"]: (u.get("full_name") or u["email"]) for u in resp.json()}
