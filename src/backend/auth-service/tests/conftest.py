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


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_test_tables():
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session():
    async with TestSessionLocal() as session:
        await session.begin_nested()
        yield session
        await session.rollback()


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
