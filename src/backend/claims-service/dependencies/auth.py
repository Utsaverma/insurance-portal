import uuid
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import settings
from models.schemas import UserContext

_http_client: Optional[httpx.AsyncClient] = None


def get_http_client() -> httpx.AsyncClient:
    if _http_client is None:
        raise RuntimeError("HTTP client not initialised")
    return _http_client


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
) -> UserContext:
    token = credentials.credentials
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    client = request.app.state.http_client
    try:
        resp = await client.get(
            f"{settings.auth_service_url}/users/me",
            headers={"Authorization": f"Bearer {token}", "X-Request-ID": request_id},
            timeout=5.0,
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Auth service timeout")
    if resp.status_code in (401, 403):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    if not resp.is_success:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Auth service error")
    data = resp.json()
    return UserContext(id=uuid.UUID(data["id"]), email=data["email"], role=data["role"])


def require_role(*roles: str):
    async def dependency(user: UserContext = Depends(get_current_user)) -> UserContext:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return dependency
