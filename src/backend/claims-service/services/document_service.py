import uuid
from pathlib import Path

import aiofiles
import magic
from fastapi import HTTPException, UploadFile, status

from config import settings


async def validate_and_store(
    file: UploadFile,
    claim_id: uuid.UUID,
) -> tuple[str, str, int]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in settings.allowed_extensions:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="File extension not allowed")

    contents = await file.read()
    if len(contents) > settings.max_file_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File exceeds 10 MB limit")

    mime = magic.from_buffer(contents, mime=True)
    if mime not in settings.allowed_mimes:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="File content does not match allowed types")

    dest_dir = Path(settings.upload_dir) / str(claim_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4()}{suffix}"
    dest_path = dest_dir / stored_name

    async with aiofiles.open(dest_path, "wb") as f:
        await f.write(contents)

    return str(dest_path), mime, len(contents)
