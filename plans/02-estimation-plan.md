# Plan 2 — Estimation Sheet

## Deliverable
**File:** `docs/estimation/eclaims-estimation.md`

## Purpose
A phased effort estimation for the full eClaims system implementation — covering all 6 project phases, with effort in person-days per role, total effort summary, resource plan, and milestone schedule.

---

## Team Composition Assumed

| Role | Count | Responsibility |
|---|---|---|
| Solution Architect | 1 | Architecture, design decisions, technical guidance |
| Business Analyst | 1 | Requirements, user stories, UAT coordination |
| Backend Developer | 2 | FastAPI microservices |
| Frontend Developer | 2 | React portals (Customer, Internal, Partner) |
| DevOps Engineer | 1 | CI/CD, Docker, AWS infrastructure, Terraform |
| QA Engineer | 1 | Test strategy, automated tests, regression |
| Project Manager | 1 | Sprint planning, reporting, risk management |

**Total team:** 9 people
**Sprint duration:** 2 weeks
**Working days per sprint:** 10 days/person

---

## Estimation Phases

### Phase 1: Requirement Specifications & System Design
**Duration:** 4 weeks (2 sprints)
**Activities:**
- Requirements workshops and user story elaboration
- Solution Approach Document (SAD) finalization
- Architecture Decision Records (ADRs)
- Database schema design
- API contract definition (OpenAPI specs)
- Data flow and sequence diagrams

| Role | Person-Days |
|---|---|
| Solution Architect | 20 |
| Business Analyst | 20 |
| Tech Lead (BE Dev) | 15 |
| Frontend Dev | 5 |
| DevOps | 5 |
| PM | 10 |
| **Phase Total** | **75 person-days** |

---

### Phase 2: Implementation
**Duration:** 20 weeks (10 sprints)
**Activities:**
- Sprint 1–2: Infrastructure setup (AWS, ECS, RDS, Redis, S3, CI/CD), Auth Service + RBAC
- Sprint 3–4: Claims Service (submission, document upload, state machine)
- Sprint 5–6: Incident Management Service (auto-assign, workflow engine)
- Sprint 7–8: Customer Portal (React) — claim submission, status tracking, workshop search
- Sprint 9–10: Internal Portal (React) — all 6 roles, claims queue, assessment, adjudication
- Sprint 11: Notification Service (SMS/Email), Partner Portal (workshop work order)
- Sprint 12: Reporting Service (role-based reports, management dashboard)
- Sprint 13: Payment Service (PCI-DSS, Stripe integration)
- Sprint 14: Document Service (S3, OpenSearch metadata, versioning)
- Sprint 15+: Integration, hardening, performance optimization

| Role | Person-Days |
|---|---|
| Solution Architect | 30 |
| Backend Developer × 2 | 200 |
| Frontend Developer × 2 | 180 |
| DevOps | 60 |
| QA Engineer | 80 |
| PM | 40 |
| **Phase Total** | **590 person-days** |

---

### Phase 3: Testing
**Duration:** 6 weeks (3 sprints) — overlaps with last 2 implementation sprints
**Activities:**
- Unit testing (target >80% coverage per service)
- Integration testing (service boundaries, event flows)
- End-to-end testing (critical user journeys per role)
- Performance testing (load test: 99% < 5000ms SLA)
- Security testing (OWASP Top 10 scan, penetration test)
- Regression test suite finalization

| Role | Person-Days |
|---|---|
| QA Lead / Engineer | 50 |
| Backend Dev (test support) | 20 |
| Frontend Dev (test support) | 15 |
| DevOps (test env setup) | 10 |
| PM | 10 |
| **Phase Total** | **105 person-days** |

---

### Phase 4: UAT (User Acceptance Testing)
**Duration:** 4 weeks (2 sprints)
**Activities:**
- UAT environment setup and data seeding
- Client-guided acceptance testing (all user roles)
- Defect triage and fix cycles (2 rounds)
- Sign-off documentation

| Role | Person-Days |
|---|---|
| Business Analyst | 20 |
| QA Engineer | 20 |
| Backend Dev (defect fixes) | 15 |
| Frontend Dev (defect fixes) | 10 |
| PM | 10 |
| **Phase Total** | **75 person-days** |

---

### Phase 5: Documentation, Go-Live & Transition
**Duration:** 3 weeks
**Activities:**
- Runbook creation (deployment, rollback, incident response)
- Admin user guide and end-user training materials
- Production deployment (blue-green cutover)
- Hypercare support (2 weeks post go-live)
- Transition to operations team

| Role | Person-Days |
|---|---|
| Solution Architect | 5 |
| Business Analyst | 10 |
| DevOps | 15 |
| QA | 5 |
| PM | 10 |
| **Phase Total** | **45 person-days** |

---

### Phase 6: Project Management & Coordination
**Duration:** Spans entire project (~33 weeks)
**Activities:**
- Sprint ceremonies (planning, daily standup, review, retrospective)
- Stakeholder reporting (weekly status, risk register, RAID log)
- Change management
- Budget tracking

| Role | Person-Days |
|---|---|
| PM | 55 |
| Solution Architect (governance) | 15 |
| **Phase Total** | **70 person-days** |

---

## Total Effort Summary

| Phase | Person-Days | Calendar Duration |
|---|---|---|
| 1. Requirement Specs & System Design | 75 | 4 weeks |
| 2. Implementation | 590 | 20 weeks |
| 3. Testing | 105 | 6 weeks (overlaps Phase 2) |
| 4. UAT | 75 | 4 weeks |
| 5. Go-Live & Transition | 45 | 3 weeks |
| 6. Project Management | 70 | Spans full project |
| **TOTAL** | **960 person-days** | **~33 weeks / ~8 months** |

---

## Milestone Schedule (Relative to Project Kickoff — Week 0)

| Milestone | Target Week |
|---|---|
| Project Kickoff | Week 0 |
| SAD & Architecture Finalized | Week 4 |
| Development Environment Ready | Week 6 |
| Auth Service + Claims Service MVP | Week 10 |
| Customer Portal Beta | Week 14 |
| Internal Portal Beta | Week 18 |
| All Services Integrated | Week 22 |
| Performance Testing Complete | Week 26 |
| UAT Sign-Off | Week 30 |
| Production Go-Live | Week 33 |
| Hypercare Complete | Week 35 |

---

## Resource Plan

| Role | Sprint 1–2 | Sprint 3–6 | Sprint 7–12 | Sprint 13–15 | UAT | Go-Live |
|---|---|---|---|---|---|---|
| Architect | Full | Part-time | Part-time | Part-time | — | Part-time |
| BA | Full | Full | Part-time | Full | Full | Part-time |
| BE Dev × 2 | Full | Full | Full | Full | Support | — |
| FE Dev × 2 | Part-time | Part-time | Full | Full | Support | — |
| DevOps | Full | Part-time | Part-time | Full | Part-time | Full |
| QA | Part-time | Part-time | Full | Full | Full | — |
| PM | Full | Full | Full | Full | Full | Full |

---

## Estimation Assumptions
1. Team members are fully allocated (no split across other projects)
2. Sprint = 2 weeks; 10 working days per sprint per person
3. 20% buffer applied to implementation phase for integration complexity
4. UAT defect fix cycle assumed at 2 rounds; major defects escalated as change requests
5. AWS infrastructure costs are excluded (OpEx, not implementation effort)
6. 3rd-party integrations (Stripe, Twilio) use their standard SDKs; no custom adapter needed
7. Mobile app development is out of scope for this estimation
8. Legacy system data migration is out of scope

---

## Verification Checklist
- [ ] All 6 phases present with effort numbers
- [ ] Total effort calculated and matches sum of phases
- [ ] Milestone table with relative dates present
- [ ] Resource plan table showing role allocation per phase
- [ ] Assumptions clearly documented
