import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

import config as _config

_config.settings.database_url = "sqlite+aiosqlite:///:memory:"

from main import app
from dependencies.db import get_db
from models.db_models import Base

TEST_ENGINE = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
TestSessionLocal = async_sessionmaker(TEST_ENGINE, expire_on_commit=False, class_=AsyncSession)

CANNED_EMAIL = "test@example.com"
CANNED_PASSWORD = "Password1!"


@pytest_asyncio.fixture(autouse=True)
async def create_test_tables():
    """Rebuild the schema per test.

    The repositories call session.commit(), which ends the enclosing SAVEPOINT,
    so a begin_nested()/rollback() sandwich gave no isolation: SQLAlchemy pools
    a sqlite ':memory:' engine onto a single connection, so committed rows
    leaked into every later test and the `registered_user` fixture started
    returning 409. Dropping and recreating is cheap for an in-memory DB.
    """
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """The login limiter is a process-global in-memory store keyed by IP.

    Without this, every test that ran after test_rate_limit_on_login got a 429
    from /auth/login and failed with KeyError: 'access_token'.
    """
    import main
    from api.routers import auth as auth_router

    for limiter in (main.limiter, auth_router.limiter):
        try:
            limiter.reset()
        except NotImplementedError:  # storage backend without reset support
            pass
    yield


@pytest_asyncio.fixture
async def db_session():
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def registered_user(client):
    resp = await client.post(
        "/auth/register",
        json={"email": CANNED_EMAIL, "password": CANNED_PASSWORD, "full_name": "Test User"},
    )
    assert resp.status_code == 201
    return resp.json()
