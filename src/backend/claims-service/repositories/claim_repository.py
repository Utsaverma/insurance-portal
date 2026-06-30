import uuid
from typing import Optional

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import Claim, ClaimStatus, ClaimStatusHistory


class ClaimRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_claim_number(self) -> str:
        result = await self.db.execute(
            text("SELECT 'CLM-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(nextval('claim_seq')::text, 5, '0')")
        )
        return result.scalar_one()

    async def create(self, data, customer_id: uuid.UUID) -> Claim:
        claim_number = await self.generate_claim_number()
        claim = Claim(
            claim_number=claim_number,
            customer_id=customer_id,
            policy_number=data.policy_number,
            incident_date=data.incident_date,
            incident_description=data.incident_description,
            claimed_amount=data.claimed_amount,
            status=ClaimStatus.SUBMITTED,
        )
        self.db.add(claim)
        await self.db.flush()
        await self.db.refresh(claim)
        return claim

    async def get_by_id(self, claim_id: uuid.UUID) -> Optional[Claim]:
        result = await self.db.execute(select(Claim).where(Claim.id == claim_id))
        return result.scalar_one_or_none()

    async def list_claims(
        self,
        customer_id: Optional[uuid.UUID] = None,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[list[Claim], int]:
        q = select(Claim)
        count_q = select(func.count()).select_from(Claim)
        if customer_id:
            q = q.where(Claim.customer_id == customer_id)
            count_q = count_q.where(Claim.customer_id == customer_id)
        total = (await self.db.execute(count_q)).scalar_one()
        items = (await self.db.execute(q.offset(skip).limit(limit))).scalars().all()
        return list(items), total

    async def update_status(
        self,
        claim: Claim,
        new_status: ClaimStatus,
        changed_by: uuid.UUID,
        note: Optional[str] = None,
    ) -> Claim:
        old_status = claim.status
        claim.status = new_status
        history = ClaimStatusHistory(
            claim_id=claim.id,
            from_status=old_status,
            to_status=new_status,
            changed_by=changed_by,
            note=note,
        )
        self.db.add(history)
        await self.db.flush()
        await self.db.refresh(claim)
        return claim

    async def get_history(self, claim_id: uuid.UUID) -> list[ClaimStatusHistory]:
        result = await self.db.execute(
            select(ClaimStatusHistory)
            .where(ClaimStatusHistory.claim_id == claim_id)
            .order_by(ClaimStatusHistory.changed_at)
        )
        return list(result.scalars().all())
