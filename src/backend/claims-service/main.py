import uuid
from contextlib import asynccontextmanager

import httpx
import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_ipaddr

from api.routers import claims as claims_router
from api.routers import documents as documents_router
from config import settings
from dependencies.db import create_tables, engine

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

log = structlog.get_logger(__name__)
limiter = Limiter(key_func=get_ipaddr)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(timeout=5.0)
    app.state.redis = await aioredis.from_url(settings.redis_url, decode_responses=False)
    await app.state.redis.ping()
    if settings.environment == "development":
        await create_tables()
    yield
    await app.state.http_client.aclose()
    await app.state.redis.aclose()
    await engine.dispose()


app = FastAPI(title="eClaims Claims Service", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    import time
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    structlog.contextvars.bind_contextvars(correlation_id=request_id)
    start = time.perf_counter()
    try:
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        log.info("http.request", method=request.method, path=request.url.path,
                 status_code=response.status_code, duration_ms=duration_ms)
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        structlog.contextvars.clear_contextvars()


app.include_router(claims_router.router)
app.include_router(documents_router.router)


@app.get("/health", tags=["health"])
async def health(request: Request):
    db_ok = "ok"
    redis_ok = "ok"
    try:
        from dependencies.db import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            from sqlalchemy import text
            await session.execute(text("SELECT 1"))
    except Exception:
        db_ok = "error"
    try:
        await request.app.state.redis.ping()
    except Exception:
        redis_ok = "error"
    return {"status": "ok" if db_ok == "ok" and redis_ok == "ok" else "degraded", "db": db_ok, "redis": redis_ok}
