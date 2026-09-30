"""Claim documents: upload validation and storage, listing and download.

Access to a claim's documents follows the claim's own access rule (services.claims_service).
"""
import uuid
from pathlib import Path

import aiofiles
import magic
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.db_models import ClaimDocument
from models.schemas import UserContext
from repositories.document_repository import DocumentRepository
from services.claims_service import get_accessible_claim
from services.errors import FileTooLarge, NotFound, UnsupportedFile


async def validate_and_store(
    file: UploadFile,
    claim_id: uuid.UUID,
) -> tuple[str, str, int]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in settings.allowed_extensions:
        raise UnsupportedFile("File extension not allowed")

    contents = await file.read()
    if len(contents) > settings.max_file_bytes:
        raise FileTooLarge(f"File exceeds {settings.max_file_size_mb} MB limit")

    # Trust the bytes, not the file name: sniff the real content type.
    mime = magic.from_buffer(contents, mime=True)
    if mime not in settings.allowed_mimes:
        raise UnsupportedFile("File content does not match allowed types")

    dest_dir = Path(settings.upload_dir) / str(claim_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4()}{suffix}"
    dest_path = dest_dir / stored_name

    async with aiofiles.open(dest_path, "wb") as f:
        await f.write(contents)

    return str(dest_path), mime, len(contents)


async def upload_document(
    claim_id: uuid.UUID, file: UploadFile, user: UserContext, db: AsyncSession
) -> ClaimDocument:
    await get_accessible_claim(claim_id, user, db)
    stored_path, mime_type, size = await validate_and_store(file, claim_id)
    return await DocumentRepository(db).create(
        claim_id=claim_id,
        filename=file.filename or "upload",
        stored_path=stored_path,
        mime_type=mime_type,
        file_size_bytes=size,
        uploaded_by=user.id,
    )


async def list_documents(claim_id: uuid.UUID, user: UserContext, db: AsyncSession) -> list[ClaimDocument]:
    await get_accessible_claim(claim_id, user, db)
    return await DocumentRepository(db).list_for_claim(claim_id)


async def get_document(
    claim_id: uuid.UUID, doc_id: uuid.UUID, user: UserContext, db: AsyncSession
) -> ClaimDocument:
    await get_accessible_claim(claim_id, user, db)
    doc = await DocumentRepository(db).get_by_id(doc_id, claim_id)
    if doc is None:
        raise NotFound("Document not found")
    return doc
