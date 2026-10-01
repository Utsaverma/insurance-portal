from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from config import settings

# Pool sizing applies to PostgreSQL only; SQLite (used by the test suite) rejects these arguments.
_pool_args = {} if settings.database_url.startswith("sqlite") else {"pool_size": 10, "max_overflow": 20}
engine = create_async_engine(settings.database_url, **_pool_args)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

