from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import Policy


class PolicyRepository:
    """auth-service's gateway to the policy system. In the POC that system is a stub, the `policies` table in
    the shared database; against the real one this becomes a call to its API."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def is_held_by(self, policy_number: str, email: str) -> bool:
        holder = await self.db.scalar(select(Policy.holder_email).where(Policy.policy_number == policy_number))
        return holder is not None and holder.lower() == email.lower()
