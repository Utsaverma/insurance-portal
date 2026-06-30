import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import ClaimDocument


class DocumentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        claim_id: uuid.UUID,
        filename: str,
        stored_path: str,
        mime_type: str,
        file_size_bytes: int,
        uploaded_by: uuid.UUID,
    ) -> ClaimDocument:
        doc = ClaimDocument(
            claim_id=claim_id,
            filename=filename,
            stored_path=stored_path,
            mime_type=mime_type,
            file_size_bytes=file_size_bytes,
            uploaded_by=uploaded_by,
        )
        self.db.add(doc)
        await self.db.flush()
        await self.db.refresh(doc)
        return doc

    async def list_for_claim(self, claim_id: uuid.UUID) -> list[ClaimDocument]:
        result = await self.db.execute(
            select(ClaimDocument).where(ClaimDocument.claim_id == claim_id)
        )
        return list(result.scalars().all())

    async def get_by_id(self, doc_id: uuid.UUID, claim_id: uuid.UUID) -> Optional[ClaimDocument]:
        result = await self.db.execute(
            select(ClaimDocument).where(
                ClaimDocument.id == doc_id,
                ClaimDocument.claim_id == claim_id,
            )
        )
        return result.scalar_one_or_none()
