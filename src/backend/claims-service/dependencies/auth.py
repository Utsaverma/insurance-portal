import uuid

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import settings
from models.schemas import UserContext


# auto_error=False: FastAPI's own "no credentials" answer is 403, but a missing token is 401, the
# status the portals act on to send the user back to the login page.
_bearer = HTTPBearer(auto_error=False)


def _token_from(credentials: HTTPAuthorizationCredentials | None) -> str:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> UserContext:
    token = _token_from(credentials)
    # A JWT is always ASCII; anything else cannot even be forwarded as a header, so refuse it as invalid.
    if not token.isascii():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    client = request.app.state.http_client
    try:
        resp = await client.get(
            f"{settings.auth_service_url}/users/me",
            headers={"Authorization": f"Bearer {token}", "X-Request-ID": request.state.request_id},
            timeout=5.0,
        )
    except httpx.HTTPError:
        # Timeouts and refused connections alike: the caller did nothing wrong, the dependency is down.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Auth service unavailable")
    if resp.status_code in (401, 403):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    if not resp.is_success:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Auth service error")
    data = resp.json()
    # .get, not [...], so an auth-service response predating the full_name
    # field cannot 500 the claims-service.
    return UserContext(
        id=uuid.UUID(data["id"]),
        email=data["email"],
        role=data["role"],
        full_name=data.get("full_name"),
    )


async def get_bearer_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    return _token_from(credentials)


def require_role(*roles: str):
    async def dependency(user: UserContext = Depends(get_current_user)) -> UserContext:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return dependency
