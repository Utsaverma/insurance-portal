# Plan 1 — Solution Approach Document (SAD)

## Deliverable
**File:** `docs/sad/solution-approach-document.md`
**Diagram:** `docs/sad/architecture-diagram.drawio.xml`

## Purpose
A client-ready, Nagarro-format architecture document for the eClaims system — written fresh (not derived from `misc/`). Must be presentable with no grammatical or formatting issues.

---

## Document Sections

### 1. Executive Summary
- One-page overview: business problem, proposed solution, expected outcomes
- Target audience: senior stakeholders / client

### 2. Problem Statement
YCompany (200M+ customers) pain points:
- Manual claim processing → long settlement times, cheque payments
- No real-time customer tracking or notifications
- Claims adjuster field-to-office process is manual and costly
- No analytics or management reporting capability
- 3rd-party workshop delays due to manual approval and payment

### 3. Solution Overview
eClaims system components:
- **Customer Portal** (web + mobile-ready): claim submission, status tracking, workshop selection, rental booking, electronic payment
- **Internal Portal**: role-based access for Case Manager, Surveyor, Adjustor, Auditor, Regional Manager, Top Management
- **Partner Portal**: workshop login, work order upload, repair status updates, payment tracking
- **Notification Engine**: SMS/Email alerts at every claim status change
- **Reporting Module**: role-based claim reports, processing time, aging matrix, fraud reports
- **Document Management**: central archive of all claim documents for audit/compliance

### 4. Detailed Solution Architecture — 6-Layer Microservices on AWS ECS Fargate

#### Layer 1: Client / Edge
- React Web Portal (Customer, Partner, Internal — separate SPAs)
- Mobile App (iOS/Android) — out of scope for Phase 1 POC, in scope for architecture

#### Layer 2: API Gateway / Ingress
- AWS WAF + Shield (DDoS, OWASP protection)
- CloudFront CDN (static asset caching)
- Application Load Balancer (ALB)
- Auth Service (OAuth2/JWT — 15min access token, 7-day refresh)

#### Layer 3: Microservices (ECS Fargate, Multi-AZ)
**Core Services:**
- Claims Service (FastAPI) — create/read/update claims, state machine enforcement
- Incident Management Service — auto-assign Surveyor/Adjustor/Case Manager by geography + availability
- Workflow Engine — claim lifecycle state machine (integrates with AWS Step Functions)
- Notification Service — SMS (SNS/Twilio), Email (SES), push notification
- Fraud Detection Service — rule-based + ML flag on submission
- Reporting Service — aggregation queries, PDF/CSV export

**Support Services:**
- Payment Service (PCI-DSS) — electronic payment processing (Stripe/PayFac)
- User / RBAC Service — 6 roles, configurable permissions without code changes
- Document Service — file upload/download, metadata, versioning (S3 + OpenSearch)
- Location Service — partner workshop/car rental lookup by zip/geo
- Configuration Service — feature flags, role-permission config

#### Layer 4: Async / Messaging
- AWS EventBridge — central event bus (ClaimCreated, StatusChanged, PaymentApproved)
- AWS SQS — work queues per service (decoupling, retry)
- AWS SNS — fan-out for notifications
- AWS Lambda — lightweight event-driven functions

#### Layer 5: Data (Polyglot, Multi-AZ)
- **Claims DB** — RDS PostgreSQL, Multi-AZ (primary transactional store)
- **User DB** — RDS PostgreSQL, Multi-AZ
- **Document DB** — MongoDB Atlas cluster (rich metadata queries)
- **Cache** — ElastiCache Redis (session, claim status cache, <100ms latency)
- **Search** — OpenSearch (document full-text search, workshop geo-search)
- **Object Storage** — S3 (accident photos, PDFs, work orders; versioned, encrypted)
- **Data Warehouse** — Redshift (analytics, management reporting, fraud analytics)

#### Layer 6: Infrastructure / Platform
- IAM + SSO (Okta integration) — centralized identity
- Secrets Manager + KMS — secrets rotation, AES-256 encryption at rest
- CloudWatch + X-Ray — structured logs, distributed tracing
- CloudTrail — immutable audit log for all API calls
- CodePipeline + CodeBuild — CI/CD, blue-green deployment
- Terraform — Infrastructure as Code (IaC)
- ECS Fargate — serverless containers, no EC2 management

### 5. Actors & Roles

| Actor | Portal | Key Capabilities |
|---|---|---|
| Customer | Customer Portal | Submit claim, upload docs, track status, select workshop, book rental, pay |
| Case Manager | Internal Portal | Assign/delegate cases, override decisions, view full case details |
| Surveyor | Internal Portal / Mobile | Submit field damage assessment, update vehicle status |
| Adjustor | Internal Portal | Review claim + documents + survey, adjudicate, approve/reject amount |
| Auditor | Internal Portal | Read-only access to all claims and processing history |
| Regional Manager | Internal Portal | Region-level reports: processing time, amounts, claim count |
| Top Management | Internal Portal | Cross-region dashboard, KPIs, trend analysis |
| Partner Workshop | Partner Portal | Upload work order + estimates, update repair status, track payment |
| Car Rental Partner | Partner Portal | Rental vehicle catalog, booking confirmation |

### 6. Key Workflows

**Workflow 1: Claim Submission & Assignment**
1. Customer logs in → submits claim (incident details + photos + police report)
2. Claims Service generates Claim ID → publishes `ClaimCreated` event
3. Incident Management Service → auto-assigns Case Manager + Surveyor + Adjustor (by location + availability)
4. Notification Service → sends SMS/Email to assigned staff and customer (claim received, ID confirmed)

**Workflow 2: Survey & Adjudication**
1. Customer selects partner workshop → appointment booked → vehicle dropped off
2. Surveyor assesses damage → submits assessment electronically
3. `SurveySubmitted` event → Adjustor notified
4. Adjustor reviews claim + documents + survey → adjudicates claim amount based on policy coverage
5. `ClaimApproved` event → Customer notified of approved amount; Workshop notified to proceed

**Workflow 3: Repair Tracking & Payment**
1. Workshop updates repair status → `RepairStatusUpdated` event → Customer notified
2. Workshop updates delivery date → Customer notified of change
3. Repair complete → Workshop submits final invoice
4. Customer notified of final bill → makes electronic payment from portal
5. Workshop tracks payment status via Partner Portal

**Workflow 4: Reporting**
1. Case Manager generates report on assigned claims (processing time, pending)
2. Regional Manager views region dashboard (amounts paid out, claims count, geography)
3. Top Management views cross-region KPIs, identifies high-claim regions

### 7. NFR Coverage (Single-Page Pullout)

| NFR | Requirement | Implementation |
|---|---|---|
| Availability | 24/7, auto-recovery on crash | Multi-AZ ECS (3 zones), health checks every 5s, auto-restart on failure, RDS Multi-AZ failover <60s |
| Scalability | Handle 200M+ customers, future growth | ECS Auto Scaling Group (2–100 instances), DB read replicas, SQS-based decoupling, Redis caching |
| Performance | 99% requests < 5000ms (peak + non-peak) | Redis L1 cache, CloudFront edge cache, connection pooling, query indexing, P50/P95/P99 latency monitoring |
| Security | OWASP Top 10, data encryption, RBAC | WAF+Shield, OAuth2+JWT, RBAC at every layer, KMS AES-256 at rest, TLS 1.2+ in transit, PCI-DSS for payments, audit trail |
| Resilience | Self-healing, no single point of failure | Circuit breakers (Resilience4j pattern), exponential backoff retries, blue-green deploy, RTO <15min, RPO <5min |
| Observability | Debug any error, SLA monitoring | Structured JSON logs → CloudWatch, X-Ray distributed tracing, CloudTrail audit, custom KPI metrics, automated SLA alerts |
| Flexibility | No code changes for role config; on-prem + cloud | Config Service for role permissions, Terraform IaC for both on-prem and AWS deployment |
| Compliance | Audit trail, no repudiation, fraud prevention | CloudTrail immutable audit, digital signatures on claim documents, fraud detection rules + ML flags |

### 8. Technology Stack

| Component | Technology | Justification |
|---|---|---|
| Backend API | Python FastAPI | Async, high performance, OpenAPI auto-gen, strong typing via Pydantic |
| Frontend | React 18 + TypeScript + Vite | Component reuse across 3 portals, strong ecosystem, type safety |
| Primary DB | PostgreSQL 15 (RDS Multi-AZ) | ACID, relational claims data, mature, AWS managed |
| Document DB | MongoDB Atlas | Flexible schema for claim documents, rich metadata queries |
| Cache | Redis 7 (ElastiCache) | Sub-millisecond session + claim status cache |
| Search | OpenSearch | Document full-text + geo-search for workshops |
| Object Storage | AWS S3 | Infinitely scalable, 99.999999999% durability, native encryption |
| Messaging | EventBridge + SQS + SNS | Cloud-native event bus, reliable queuing, fan-out |
| Workflow | AWS Step Functions | Managed state machine, audit trail, no infra overhead |
| Notifications | AWS SES (email) + SNS (SMS) | AWS-native, pay-per-use, compliance |
| Payments | Stripe (PCI-DSS Level 1) | Industry-standard, fraud detection built-in |
| Container Orchestration | AWS ECS Fargate | Serverless containers, no EC2 management |
| IaC | Terraform | Multi-cloud, version-controlled infra |
| CI/CD | AWS CodePipeline + CodeBuild | AWS-native, blue-green support |
| Observability | CloudWatch + X-Ray + CloudTrail | Zero ops overhead, native AWS integration |
| Security | AWS WAF + Shield + KMS + IAM | Comprehensive security at every layer |
| Data Warehouse | Redshift | Petabyte-scale analytics for management reporting |

### 9. Assumptions & Scope

**In Scope:**
- Customer Portal (web, React)
- Internal Portal (web, React) — all 6 roles
- Partner Workshop Portal (web, React)
- Claims lifecycle: Submission → Survey → Adjudication → Approval → Payment
- Document management and archival
- SMS/Email notifications at every status change
- Role-based reporting (Case Manager, Regional Manager, Top Management)
- Electronic payment (Stripe integration)
- AWS cloud deployment

**Out of Scope (Phase 1):**
- Native mobile app (iOS/Android) — web-first; mobile-responsive design in scope
- Multi-region active-active deployment (architecture supports it; not implemented in Phase 1)
- ML-based fraud detection (rule-based engine in Phase 1; ML model in Phase 2)
- Multi-language support (English only per requirements)
- Car rental integration API (UI present; integration deferred)
- Legacy system migration / data backfill

**Assumptions:**
1. YCompany will use AWS as cloud provider
2. Customer identity verified via existing policy number at registration
3. Partner workshops are pre-registered in the system by admin
4. Payment via Stripe; PCI-DSS scope limited to Stripe's hosted payment page
5. SMS notifications via AWS SNS (US numbers only)
6. Surveyor geo-coverage areas are pre-configured in Location Service
7. Team has AWS account with necessary permissions

### 10. References / Appendix
- eClaims Case Study PDF: `requirements/eClaims - Insurance -Senior Staff Engineer.pdf`
- MSAG Diagram Guidelines: `requirements/MSAG-Diagram-Preparation-Guidelines-v1.1.pdf`
- Architecture Diagram: `docs/sad/architecture-diagram.drawio.xml`
- AWS Well-Architected Framework: https://aws.amazon.com/architecture/well-architected/
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- PCI-DSS Compliance: https://www.pcisecuritystandards.org/

---

## Architecture Diagram Spec

**File:** `docs/sad/architecture-diagram.drawio.xml`
**Tool:** draw.io / diagrams.net (open XML in diagrams.net desktop or app.diagrams.net)

**Structure:**
- 6 horizontal swim lanes (one per layer), labeled on left
- Each component in its layer as a rounded rectangle
- Directional arrows between components with protocol annotations:
  - HTTPS/TLS between client and API Gateway
  - JWT token on auth flows
  - AMQP/SQS between services and queues
  - SQL on DB connections
  - S3 API on document storage
- Color coding: Client=blue, Gateway=orange, Services=green, Data=purple, Messaging=yellow, Platform=gray
- Bounded context boxes for: Customer domain, Internal domain, Partner domain

---

## Verification Checklist
- [ ] All 10 sections present in `docs/sad/solution-approach-document.md`
- [ ] No grammatical or formatting issues (client-ready)
- [ ] `docs/sad/architecture-diagram.drawio.xml` opens correctly in diagrams.net
- [ ] All 6 layers visible in diagram with labeled components
- [ ] Data flows annotated with protocols
- [ ] NFR table is a single-page pullout (section 7)
- [ ] Technology stack table includes justification column
- [ ] Assumptions clearly separate In Scope from Out of Scope
