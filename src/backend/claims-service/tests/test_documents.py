import io
import uuid

import pytest
from httpx import AsyncClient


def _make_pdf_bytes() -> bytes:
    return b"%PDF-1.4 fake but valid-enough-header"


def _make_jpeg_bytes() -> bytes:
    return bytes([0xFF, 0xD8, 0xFF, 0xE0]) + b"\x00" * 100


@pytest.mark.asyncio
async def test_upload_valid_pdf(client, sample_claim, tmp_path, monkeypatch):
    import config
    monkeypatch.setattr(config.settings, "upload_dir", str(tmp_path))

    import services.document_service as ds
    original = ds.validate_and_store

    async def mock_validate(file, claim_id):
        contents = await file.read()
        dest = tmp_path / f"{uuid.uuid4()}.pdf"
        dest.write_bytes(contents)
        return str(dest), "application/pdf", len(contents)

    monkeypatch.setattr(ds, "validate_and_store", mock_validate)

    resp = await client.post(
        f"/claims/{sample_claim.id}/documents",
        files={"file": ("report.pdf", io.BytesIO(_make_pdf_bytes()), "application/pdf")},
    )
    assert resp.status_code == 201
    assert resp.json()["mime_type"] == "application/pdf"


@pytest.mark.asyncio
async def test_upload_exe_disguised_as_pdf_returns_415(client, sample_claim, tmp_path, monkeypatch):
    import services.document_service as ds

    async def mock_reject(file, claim_id):
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="File content does not match allowed types")

    monkeypatch.setattr(ds, "validate_and_store", mock_reject)

    pe_header = b"MZ" + b"\x00" * 100
    resp = await client.post(
        f"/claims/{sample_claim.id}/documents",
        files={"file": ("report.pdf", io.BytesIO(pe_header), "application/pdf")},
    )
    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_upload_exceeds_10mb_returns_413(client, sample_claim, monkeypatch):
    import services.document_service as ds

    async def mock_too_large(file, claim_id):
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File exceeds 10 MB limit")

    monkeypatch.setattr(ds, "validate_and_store", mock_too_large)

    resp = await client.post(
        f"/claims/{sample_claim.id}/documents",
        files={"file": ("big.pdf", io.BytesIO(b"x" * 100), "application/pdf")},
    )
    assert resp.status_code == 413


@pytest.mark.asyncio
async def test_non_allowed_role_cannot_upload(client, sample_claim, case_manager_user):
    from main import app
    from dependencies.auth import get_current_user

    async def override_cm():
        return case_manager_user

    app.dependency_overrides[get_current_user] = override_cm
    resp = await client.post(
        f"/claims/{sample_claim.id}/documents",
        files={"file": ("doc.pdf", io.BytesIO(b"data"), "application/pdf")},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unauthorized_download_forbidden(client, db_session, sample_claim, mock_redis):
    from main import app
    from dependencies.auth import get_current_user
    from models.schemas import UserContext

    other_customer = UserContext(id=uuid.uuid4(), email="other@test.com", role="CUSTOMER")

    async def override_other():
        return other_customer

    app.dependency_overrides[get_current_user] = override_other
    fake_doc_id = uuid.uuid4()
    resp = await client.get(f"/claims/{sample_claim.id}/documents/{fake_doc_id}/download")
    assert resp.status_code == 403
