from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user, require_role
from dependencies.db import get_db
from models.db_models import User
from models.schemas import UserResponse, UserUpdateRequest
from repositories.user_repository import UserRepository

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = UserRepository(db)
    updated = await repo.update(current_user, **body.model_dump(exclude_unset=True))
    return UserResponse.model_validate(updated)


@router.get("/all", response_model=list[UserResponse])
async def get_all_users(
    _: User = Depends(require_role("CASE_MANAGER", "REGIONAL_MANAGER", "SURVEYOR", "ADJUSTOR")),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from models.db_models import User as UserModel
    result = await db.execute(select(UserModel))
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]
