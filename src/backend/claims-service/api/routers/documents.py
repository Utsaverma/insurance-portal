import uuid

from fastapi import APIRouter, Depends, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user, require_role
from dependencies.db import get_db
from models.db_models import ClaimDocument
from models.schemas import DocumentResponse, UserContext
from services import document_service
from services.claims_service import UPLOAD_ROLES

router = APIRouter(prefix="/claims", tags=["documents"])


def _to_response(doc: ClaimDocument) -> DocumentResponse:
    return DocumentResponse(
        id=doc.id,
        claim_id=doc.claim_id,
        filename=doc.filename,
        mime_type=doc.mime_type,
        file_size_bytes=doc.file_size_bytes,
        uploaded_by=doc.uploaded_by,
        uploaded_at=doc.uploaded_at,
        download_url=f"/claims/{doc.claim_id}/documents/{doc.id}/download",
    )


@router.post("/{claim_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    claim_id: uuid.UUID,
    file: UploadFile,
    user: UserContext = Depends(require_role(*UPLOAD_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    doc = await document_service.upload_document(claim_id, file, user, db)
    return _to_response(doc)


@router.get("/{claim_id}/documents", response_model=list[DocumentResponse])
async def list_documents(
    claim_id: uuid.UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    docs = await document_service.list_documents(claim_id, user, db)
    return [_to_response(d) for d in docs]


@router.get("/{claim_id}/documents/{doc_id}/download")
async def download_document(
    claim_id: uuid.UUID,
    doc_id: uuid.UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await document_service.get_document(claim_id, doc_id, user, db)
    return FileResponse(doc.stored_path, media_type=doc.mime_type, filename=doc.filename)
