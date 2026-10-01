import re
import uuid
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import delete
from sqlalchemy.exc import SQLAlchemyError

from dependencies.auth import get_current_user
from models.db_models import ClaimStatus, RolePermission, WorkflowTransition
from repositories.workflow_repository import WorkflowRepository
from services.workflow_policy import CACHE_KEY, CODE_POLICY, load_policy

# The repository's init.sql, wherever the suite runs from (absent inside a bare service image).
INIT_SQL = next(
    (p / "infrastructure" / "db" / "init.sql" for p in Path(__file__).resolve().parents
     if (p / "infrastructure" / "db" / "init.sql").is_file()),
    None,
)


def _act_as(user):
    from main import app

    async def override():
        return user

    app.dependency_overrides[get_current_user] = override


async def _seed_policy(db):
    """The tables as init.sql seeds them: the same rules as the code."""
    transitions, permissions = CODE_POLICY.rows()
    db.add_all([WorkflowTransition(from_status=f, role=r, to_status=t) for f, r, t in transitions])
    db.add_all([RolePermission(role=r, permission=p) for r, p in permissions])
    await db.flush()


async def _edit_policy(db):
    """An administrator's change: adjustors can no longer reject, surveyors may read the reports."""
    await db.execute(delete(WorkflowTransition).where(
        WorkflowTransition.from_status == ClaimStatus.UNDER_ADJUDICATION,
        WorkflowTransition.role == "ADJUSTOR",
        WorkflowTransition.to_status == ClaimStatus.REJECTED,
    ))
    db.add(RolePermission(role="SURVEYOR", permission="reports.view"))
    await db.flush()


@pytest.mark.asyncio
async def test_a_changed_row_changes_behaviour_without_a_redeploy(
    client, db_session, sample_claim, adjustor_user, surveyor_user
):
    await _seed_policy(db_session)
    await _edit_policy(db_session)
    sample_claim.status = ClaimStatus.UNDER_ADJUDICATION
    sample_claim.assigned_to = adjustor_user.id
    await db_session.flush()

    _act_as(adjustor_user)
    claim = (await client.get(f"/claims/{sample_claim.id}")).json()
    assert claim["allowed_actions"]["transitions"] == ["APPROVED"]
    resp = await client.patch(f"/claims/{sample_claim.id}/status", json={"status": "REJECTED", "note": "Excluded"})
    assert resp.status_code == 400

    _act_as(surveyor_user)
    assert (await client.get("/reports/summary")).status_code == 200


@pytest.mark.asyncio
async def test_code_source_ignores_the_tables(client, db_session, sample_claim, adjustor_user, monkeypatch):
    import config

    monkeypatch.setattr(config.settings, "workflow_source", "code")
    await _seed_policy(db_session)
    await _edit_policy(db_session)
    sample_claim.status = ClaimStatus.UNDER_ADJUDICATION
    sample_claim.assigned_to = adjustor_user.id
    await db_session.flush()

    _act_as(adjustor_user)
    resp = await client.patch(f"/claims/{sample_claim.id}/status", json={"status": "REJECTED", "note": "Excluded"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_the_policy_is_cached_until_its_ttl(db_session, mock_redis):
    await _seed_policy(db_session)
    first = await load_policy(db_session, mock_redis)
    assert first.source == "db"
    assert first.steps(ClaimStatus.UNDER_ADJUDICATION, "ADJUSTOR") == {ClaimStatus.APPROVED, ClaimStatus.REJECTED}

    await _edit_policy(db_session)
    assert (await load_policy(db_session, mock_redis)) == first  # still the cached copy
    assert 0 < await mock_redis.ttl(CACHE_KEY) <= 30

    await mock_redis.delete(CACHE_KEY)  # what the TTL does after 30 s
    fresh = await load_policy(db_session, mock_redis)
    assert fresh.steps(ClaimStatus.UNDER_ADJUDICATION, "ADJUSTOR") == {ClaimStatus.APPROVED}
    assert fresh.allows("SURVEYOR", "reports.view")


@pytest.mark.asyncio
async def test_empty_or_unreadable_tables_fall_back_to_the_code(db_session, mock_redis, monkeypatch):
    empty = await load_policy(db_session, mock_redis)
    assert empty.source == "code-fallback"
    assert empty.transitions == CODE_POLICY.transitions and empty.permissions == CODE_POLICY.permissions

    async def missing_table(self):
        raise SQLAlchemyError('relation "workflow_transitions" does not exist')

    await mock_redis.delete(CACHE_KEY)
    monkeypatch.setattr(WorkflowRepository, "transitions", missing_table)
    assert (await load_policy(db_session, mock_redis)).source == "code-fallback"
    await WorkflowRepository(db_session).permissions()  # the request's session is still usable


def test_init_sql_seeds_the_same_rules_as_the_code():
    if INIT_SQL is None:
        pytest.skip("infrastructure/db/init.sql is not part of the service image")
    sql = INIT_SQL.read_text()
    transitions_block = sql.split("INSERT INTO workflow_transitions")[1].split(";")[0]
    permissions_block = sql.split("INSERT INTO role_permissions")[1].split(";")[0]
    seeded_transitions = sorted(re.findall(r"\('(\w+)',\s*'(\w+)',\s*'(\w+)'\)", transitions_block))
    seeded_permissions = sorted(re.findall(r"\('(\w+)',\s*'([\w.]+)'\)", permissions_block))
    assert (seeded_transitions, seeded_permissions) == CODE_POLICY.rows()
