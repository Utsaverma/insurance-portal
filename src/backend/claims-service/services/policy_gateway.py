"""The anti-corruption layer in front of the Policy Administration System (ST6).

The rest of the claims service sees policies only as PolicySnapshot values from a PolicyGateway, never as the
policy system's own model. In the POC the policy system is a stub: the `policies` table, read by
TablePolicyGateway. Connecting the real system means writing another gateway (an HTTP client for its API) and
nothing else.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import Policy


@dataclass(frozen=True)
class PolicySnapshot:
    policy_number: str
    holder_email: str
    holder_name: str
    product: str
    insured_item: str
    effective_from: date
    effective_to: date
    coverage_limit: Decimal
    deductible: Decimal

    def is_held_by(self, email: str) -> bool:
        return self.holder_email.lower() == email.lower()

    def in_force_on(self, day: date) -> bool:
        return self.effective_from <= day <= self.effective_to


class PolicyGateway(Protocol):
    async def get(self, policy_number: str) -> PolicySnapshot | None: ...
    async def held_by(self, email: str) -> list[PolicySnapshot]: ...


def _snapshot(p: Policy) -> PolicySnapshot:
    return PolicySnapshot(
        policy_number=p.policy_number,
        holder_email=p.holder_email,
        holder_name=p.holder_name,
        product=p.product,
        insured_item=p.insured_item,
        effective_from=p.effective_from,
        effective_to=p.effective_to,
        coverage_limit=p.coverage_limit,
        deductible=p.deductible,
    )


class TablePolicyGateway:
    """The policy-system stub: the `policies` table in the POC's shared database."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, policy_number: str) -> PolicySnapshot | None:
        policy = await self.db.get(Policy, policy_number)
        return _snapshot(policy) if policy else None

    async def held_by(self, email: str) -> list[PolicySnapshot]:
        rows = await self.db.execute(
            select(Policy).where(func.lower(Policy.holder_email) == email.lower()).order_by(Policy.effective_to.desc())
        )
        return [_snapshot(p) for p in rows.scalars().all()]
