import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

import config as _config
_config.settings.database_url = "sqlite+aiosqlite:///:memory:"
_config.settings.environment = "test"

from main import app
from dependencies.db import get_db
from models.db_models import Base, ClaimStatus
from models.schemas import UserContext

TEST_ENGINE = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
TestSession = async_sessionmaker(TEST_ENGINE, expire_on_commit=False, class_=AsyncSession)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_test_tables():
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session():
    async with TestSession() as session:
        await session.begin_nested()
        yield session
        await session.rollback()


@pytest_asyncio.fixture
def mock_redis():
    import fakeredis.aioredis
    return fakeredis.aioredis.FakeRedis()


def _make_user(role: str) -> UserContext:
    return UserContext(id=uuid.uuid4(), email=f"{role.lower()}@test.com", role=role)


@pytest.fixture
def customer_user():
    return _make_user("CUSTOMER")


@pytest.fixture
def case_manager_user():
    return _make_user("CASE_MANAGER")


@pytest.fixture
def surveyor_user():
    return _make_user("SURVEYOR")


@pytest.fixture
def adjustor_user():
    return _make_user("ADJUSTOR")


@pytest_asyncio.fixture
async def client(db_session, mock_redis, customer_user):
    from dependencies.auth import get_current_user
    import httpx

    async def override_db():
        yield db_session

    async def override_user():
        return customer_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.state.redis = mock_redis
    app.state.http_client = httpx.AsyncClient()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def sample_claim(db_session, customer_user):
    from repositories.claim_repository import ClaimRepository
    from models.schemas import ClaimCreate
    from datetime import date

    class FakeCreate:
        policy_number = "POL-TEST"
        incident_date = date(2024, 1, 1)
        incident_description = "Test incident for unit tests"
        claimed_amount = 10000

    repo = ClaimRepository(db_session)
    # Use a fixed claim number for SQLite (no claim_seq)
    from models.db_models import Claim
    claim = Claim(
        claim_number=f"CLM-TEST-{uuid.uuid4().hex[:5].upper()}",
        customer_id=customer_user.id,
        policy_number="POL-TEST",
        incident_date=date(2024, 1, 1),
        incident_description="Test incident for unit tests",
        claimed_amount=10000,
        status=ClaimStatus.SUBMITTED,
    )
    db_session.add(claim)
    await db_session.flush()
    await db_session.refresh(claim)
    return claim
