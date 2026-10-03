"""Who may do what to a claim: the workflow's transitions and the role permissions (FR3).

The rules live in two tables, workflow_transitions and role_permissions, so they can be changed without a
code change or a redeploy. The claims service reads them through a short Redis cache (WORKFLOW_CACHE_TTL,
30 s), so a change takes effect within that window. WORKFLOW_SOURCE=code uses the copy below instead; it is
also the fallback while the tables are empty or missing (a database created before they existed). The
tables are seeded from this same copy (infrastructure/db/init.sql).
"""
import json
from dataclasses import dataclass

import structlog
from redis.exceptions import RedisError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.db_models import ClaimStatus
from repositories.workflow_repository import WorkflowRepository

log = structlog.get_logger(__name__)

# Permissions. A role holds a permission when role_permissions has the (role, permission) row.
SUBMIT = "claims.submit"            # file a claim
ASSIGN = "claims.assign"            # make a claim's first assignment (SUBMITTED → ASSIGNED)
REASSIGN = "claims.reassign"        # change the assignee of an assigned claim
OVERRIDE = "claims.override"        # move a claim to any status, with a reason
WORK = "claims.work"                # be assigned claims; act only on the claims assigned to you
UPLOAD = "documents.upload"         # add documents (customers to their own claims, workers to their assigned ones)
VIEW_REPORTS = "reports.view"

# The rules in code: current status → role → statuses that role may move the claim to.
CODE_TRANSITIONS: dict[ClaimStatus, dict[str, frozenset[ClaimStatus]]] = {
    ClaimStatus.SUBMITTED: {"CASE_MANAGER": frozenset({ClaimStatus.ASSIGNED})},
    ClaimStatus.ASSIGNED: {"SURVEYOR": frozenset({ClaimStatus.UNDER_SURVEY})},
    ClaimStatus.UNDER_SURVEY: {"SURVEYOR": frozenset({ClaimStatus.SURVEYED})},
    ClaimStatus.SURVEYED: {"ADJUSTOR": frozenset({ClaimStatus.UNDER_ADJUDICATION})},
    ClaimStatus.UNDER_ADJUDICATION: {"ADJUSTOR": frozenset({ClaimStatus.APPROVED, ClaimStatus.REJECTED})},
    ClaimStatus.APPROVED: {"ADJUSTOR": frozenset({ClaimStatus.PAID})},
}
# permission → roles holding it
CODE_PERMISSIONS: dict[str, frozenset[str]] = {
    SUBMIT: frozenset({"CUSTOMER"}),
    ASSIGN: frozenset({"CASE_MANAGER"}),
    REASSIGN: frozenset({"CASE_MANAGER", "REGIONAL_MANAGER"}),
    OVERRIDE: frozenset({"CASE_MANAGER"}),
    WORK: frozenset({"SURVEYOR", "ADJUSTOR"}),
    UPLOAD: frozenset({"CUSTOMER", "SURVEYOR", "ADJUSTOR"}),
    VIEW_REPORTS: frozenset({"CASE_MANAGER", "REGIONAL_MANAGER"}),
}

CACHE_KEY = "workflow_policy:v1"


@dataclass(frozen=True)
class WorkflowPolicy:
    transitions: dict[ClaimStatus, dict[str, frozenset[ClaimStatus]]]
    permissions: dict[str, frozenset[str]]
    # Where the rules came from: "code", "db", or "code-fallback" (db requested, tables empty or missing).
    source: str

    def steps(self, current: ClaimStatus, role: str) -> frozenset[ClaimStatus]:
        return self.transitions.get(current, {}).get(role, frozenset())

    def allows(self, role: str, permission: str) -> bool:
        return role in self.permissions.get(permission, frozenset())

    @classmethod
    def from_rows(cls, transitions, permissions, source: str) -> "WorkflowPolicy":
        """Build from (from_status, role, to_status) and (role, permission) rows."""
        steps: dict[ClaimStatus, dict[str, set[ClaimStatus]]] = {}
        for from_status, role, to_status in transitions:
            steps.setdefault(ClaimStatus(from_status), {}).setdefault(role, set()).add(ClaimStatus(to_status))
        grants: dict[str, set[str]] = {}
        for role, permission in permissions:
            grants.setdefault(permission, set()).add(role)
        return cls(
            transitions={s: {r: frozenset(t) for r, t in by_role.items()} for s, by_role in steps.items()},
            permissions={p: frozenset(roles) for p, roles in grants.items()},
            source=source,
        )

    def rows(self) -> tuple[list[tuple[str, str, str]], list[tuple[str, str]]]:
        transitions = sorted(
            (current.value, role, target.value)
            for current, by_role in self.transitions.items()
            for role, targets in by_role.items()
            for target in targets
        )
        permissions = sorted((role, p) for p, roles in self.permissions.items() for role in roles)
        return transitions, permissions


CODE_POLICY = WorkflowPolicy(CODE_TRANSITIONS, CODE_PERMISSIONS, source="code")
_FALLBACK = WorkflowPolicy(CODE_TRANSITIONS, CODE_PERMISSIONS, source="code-fallback")


async def load_policy(db: AsyncSession, redis) -> WorkflowPolicy:
    if settings.workflow_source == "code":
        return CODE_POLICY
    try:
        cached = await redis.get(CACHE_KEY)
    except RedisError:
        cached = None  # the cache is an optimisation; read the tables
    if cached:
        data = json.loads(cached)
        return WorkflowPolicy.from_rows(data["transitions"], data["permissions"], source=data["source"])

    policy = await _read_tables(db)
    transitions, permissions = policy.rows()
    payload = json.dumps({"transitions": transitions, "permissions": permissions, "source": policy.source})
    try:
        await redis.setex(CACHE_KEY, settings.workflow_cache_ttl, payload)
    except RedisError:
        pass
    return policy


async def _read_tables(db: AsyncSession) -> WorkflowPolicy:
    try:
        # A savepoint, so a missing table leaves the request's transaction usable.
        async with db.begin_nested():
            repo = WorkflowRepository(db)
            transitions = await repo.transitions()
            permissions = await repo.permissions()
    except SQLAlchemyError as exc:
        log.warning("workflow_policy.fallback", reason="tables unreadable", error=str(exc).splitlines()[0])
        return _FALLBACK
    if not transitions or not permissions:
        log.warning("workflow_policy.fallback", reason="tables empty")
        return _FALLBACK
    return WorkflowPolicy.from_rows(transitions, permissions, source="db")
