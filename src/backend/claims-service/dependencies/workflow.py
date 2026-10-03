from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user
from dependencies.db import get_db
from models.schemas import UserContext
from services.workflow_policy import WorkflowPolicy, load_policy


async def get_workflow(request: Request, db: AsyncSession = Depends(get_db)) -> WorkflowPolicy:
    return await load_policy(db, request.app.state.redis)


def require_permission(*permissions: str):
    """The caller's role must hold at least one of `permissions` in the current workflow policy."""
    async def dependency(
        user: UserContext = Depends(get_current_user),
        workflow: WorkflowPolicy = Depends(get_workflow),
    ) -> UserContext:
        if not any(workflow.allows(user.role, p) for p in permissions):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return dependency
