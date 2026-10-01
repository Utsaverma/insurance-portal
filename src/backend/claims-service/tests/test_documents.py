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

    resp = await client.post(
        f"/claims/{sample_claim.id}/documents",
        files={"file": ("report.pdf", io.BytesIO(_make_pdf_bytes()), "application/pdf")},
    )
    assert resp.status_code == 201
    assert resp.json()["mime_type"] == "application/pdf"


@pytest.mark.asyncio
async def test_upload_exe_disguised_as_pdf_returns_415(client, sample_claim, tmp_path, monkeypatch):
    import config
    monkeypatch.setattr(config.settings, "upload_dir", str(tmp_path))

    # Content sniffing sees a Windows executable despite the .pdf name.
    pe_header = b"MZ" + b"\x00" * 100
    resp = await client.post(
        f"/claims/{sample_claim.id}/documents",
        files={"file": ("report.pdf", io.BytesIO(pe_header), "application/pdf")},
    )
    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_upload_content_must_match_its_extension(client, sample_claim, tmp_path, monkeypatch):
    import config
    monkeypatch.setattr(config.settings, "upload_dir", str(tmp_path))

    # A real JPEG, which is an allowed type, but not what a .pdf may contain.
    resp = await client.post(
        f"/claims/{sample_claim.id}/documents",
        files={"file": ("report.pdf", io.BytesIO(_make_jpeg_bytes()), "application/pdf")},
    )
    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_upload_keeps_only_the_base_file_name(client, sample_claim, tmp_path, monkeypatch):
    import config
    monkeypatch.setattr(config.settings, "upload_dir", str(tmp_path))

    resp = await client.post(
        f"/claims/{sample_claim.id}/documents",
        files={"file": ("../../etc/report.pdf", io.BytesIO(_make_pdf_bytes()), "application/pdf")},
    )
    assert resp.status_code == 201
    assert resp.json()["filename"] == "report.pdf"

    listed = (await client.get(f"/claims/{sample_claim.id}/documents")).json()
    assert [d["filename"] for d in listed] == ["report.pdf"]
    download = await client.get(listed[0]["download_url"])
    assert download.status_code == 200
    assert download.content == _make_pdf_bytes()


@pytest.mark.asyncio
async def test_download_of_a_document_whose_file_is_gone_returns_404(client, sample_claim, tmp_path, monkeypatch):
    import config
    monkeypatch.setattr(config.settings, "upload_dir", str(tmp_path))

    doc = (await client.post(
        f"/claims/{sample_claim.id}/documents",
        files={"file": ("report.pdf", io.BytesIO(_make_pdf_bytes()), "application/pdf")},
    )).json()
    for stored in tmp_path.rglob("*.pdf"):
        stored.unlink()

    resp = await client.get(doc["download_url"])
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_upload_over_size_limit_returns_413(client, sample_claim, tmp_path, monkeypatch):
    import config
    monkeypatch.setattr(config.settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(config.settings, "max_file_size_mb", 0)  # any non-empty file is now too large

    resp = await client.post(
        f"/claims/{sample_claim.id}/documents",
        files={"file": ("big.pdf", io.BytesIO(_make_pdf_bytes()), "application/pdf")},
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


@pytest.mark.asyncio
async def test_staff_upload_only_to_claims_assigned_to_them(client, db_session, sample_claim, surveyor_user, tmp_path, monkeypatch):
    import config
    from main import app
    from dependencies.auth import get_current_user

    monkeypatch.setattr(config.settings, "upload_dir", str(tmp_path))

    async def override_surveyor():
        return surveyor_user

    app.dependency_overrides[get_current_user] = override_surveyor
    url = f"/claims/{sample_claim.id}/documents"

    def report():
        return {"file": ("survey-report.pdf", io.BytesIO(_make_pdf_bytes()), "application/pdf")}

    assert (await client.post(url, files=report())).status_code == 403

    sample_claim.assigned_to = surveyor_user.id
    await db_session.flush()
    assert (await client.post(url, files=report())).status_code == 201


@pytest.mark.asyncio
async def test_customer_adds_evidence_until_the_claim_is_paid(client, db_session, sample_claim, tmp_path, monkeypatch):
    import config
    from models.db_models import ClaimStatus

    monkeypatch.setattr(config.settings, "upload_dir", str(tmp_path))
    url = f"/claims/{sample_claim.id}/documents"

    def evidence():
        return {"file": ("repair-estimate.pdf", io.BytesIO(_make_pdf_bytes()), "application/pdf")}

    # After submission, and even after a rejection (evidence for a reopening).
    sample_claim.status = ClaimStatus.REJECTED
    await db_session.flush()
    assert (await client.post(url, files=evidence())).status_code == 201
    assert (await client.get(f"/claims/{sample_claim.id}")).json()["allowed_actions"]["upload"] is True

    sample_claim.status = ClaimStatus.PAID
    await db_session.flush()
    resp = await client.post(url, files=evidence())
    assert resp.status_code == 400
    assert "paid claim is final" in resp.json()["detail"]
    assert (await client.get(f"/claims/{sample_claim.id}")).json()["allowed_actions"]["upload"] is False
