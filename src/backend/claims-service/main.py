import logging
import time
import uuid
from contextlib import asynccontextmanager

import httpx
import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from api.routers import claims as claims_router
from api.routers import documents as documents_router
from api.routers import reports as reports_router
from config import settings
from dependencies.db import AsyncSessionLocal, engine
from services.errors import (
    BusinessRuleViolation,
    ClaimsError,
    FileTooLarge,
    Forbidden,
    InvalidTransition,
    NotFound,
    UnsupportedFile,
)

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, settings.log_level.upper(), logging.INFO)),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

log = structlog.get_logger(__name__)

# Business-rule failures from the service layer, mapped to HTTP status codes in one place.
_HTTP_STATUS = {
    NotFound: 404,
    Forbidden: 403,
    InvalidTransition: 400,
    BusinessRuleViolation: 400,
    UnsupportedFile: 415,
    FileTooLarge: 413,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(timeout=5.0)
    app.state.redis = await aioredis.from_url(settings.redis_url, decode_responses=False)
    await app.state.redis.ping()
    yield
    await app.state.http_client.aclose()
    await app.state.redis.aclose()
    await engine.dispose()


app = FastAPI(title="eClaims Claims Service", version="0.1.0", lifespan=lifespan)


@app.exception_handler(ClaimsError)
async def claims_error_handler(request: Request, exc: ClaimsError) -> JSONResponse:
    return JSONResponse(status_code=_HTTP_STATUS.get(type(exc), 400), content={"detail": exc.detail})


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    # One request ID per request, reused for every downstream call so logs correlate across services.
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
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
app.include_router(reports_router.router)


@app.get("/health", tags=["health"])
async def health(request: Request):
    db_ok = "ok"
    redis_ok = "ok"
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        db_ok = "error"
    try:
        await request.app.state.redis.ping()
    except Exception:
        redis_ok = "error"
    return {"status": "ok" if db_ok == "ok" and redis_ok == "ok" else "degraded", "db": db_ok, "redis": redis_ok}
