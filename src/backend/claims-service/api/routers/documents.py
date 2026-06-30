import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user, require_role
from dependencies.db import get_db
from models.schemas import DocumentResponse, UserContext
from repositories.claim_repository import ClaimRepository
from repositories.document_repository import DocumentRepository
from services.document_service import validate_and_store

router = APIRouter(prefix="/claims", tags=["documents"])

UPLOAD_ROLES = ("CUSTOMER", "SURVEYOR", "ADJUSTOR")


@router.post("/{claim_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    claim_id: uuid.UUID,
    file: UploadFile,
    request: Request,
    user: UserContext = Depends(require_role(*UPLOAD_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    claim_repo = ClaimRepository(db)
    claim = await claim_repo.get_by_id(claim_id)
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")
    if user.role == "CUSTOMER" and claim.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    stored_path, mime_type, size = await validate_and_store(file, claim_id)
    doc_repo = DocumentRepository(db)
    doc = await doc_repo.create(
        claim_id=claim_id,
        filename=file.filename or "upload",
        stored_path=stored_path,
        mime_type=mime_type,
        file_size_bytes=size,
        uploaded_by=user.id,
    )
    return DocumentResponse(
        **doc.__dict__,
        download_url=f"/claims/{claim_id}/documents/{doc.id}/download",
    )


@router.get("/{claim_id}/documents", response_model=list[DocumentResponse])
async def list_documents(
    claim_id: uuid.UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    claim_repo = ClaimRepository(db)
    claim = await claim_repo.get_by_id(claim_id)
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")
    if user.role == "CUSTOMER" and claim.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    doc_repo = DocumentRepository(db)
    docs = await doc_repo.list_for_claim(claim_id)
    return [
        DocumentResponse(**d.__dict__, download_url=f"/claims/{claim_id}/documents/{d.id}/download")
        for d in docs
    ]


@router.get("/{claim_id}/documents/{doc_id}/download")
async def download_document(
    claim_id: uuid.UUID,
    doc_id: uuid.UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    claim_repo = ClaimRepository(db)
    claim = await claim_repo.get_by_id(claim_id)
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")
    if user.role == "CUSTOMER" and claim.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    doc_repo = DocumentRepository(db)
    doc = await doc_repo.get_by_id(doc_id, claim_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return FileResponse(doc.stored_path, media_type=doc.mime_type, filename=doc.filename)
