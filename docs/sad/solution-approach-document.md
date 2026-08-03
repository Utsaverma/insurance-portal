# eClaims — Solution Approach Document

**Electronic Claims Processing Platform for YCompany**

---

## Document Control

| Field | Detail |
|---|---|
| Document title | eClaims — Solution Approach Document (SAD) |
| Project | YCompany eClaims — Claims Modernisation Programme |
| Prepared for | YCompany (Auto Insurance) |
| Prepared by | Utsav Verma — Senior Staff Engineer, Nagarro |
| Version | 1.0 |
| Status | Final — Client Ready |
| Date | 07 July 2026 |
| Classification | Confidential |
| Companion artefact | `docs/sad/architecture-diagram.drawio.xml` (draw.io / diagrams.net source) |

### Revision history

| Version | Date | Author | Summary of change |
|---|---|---|---|
| 0.1 | 30 June 2026 | Utsav Verma | Initial draft — structure and problem framing |
| 1.0 | 07 July 2026 | Utsav Verma | Complete architecture, NFR pull-out, technology stack, scope — issued for review |

### Table of contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [Detailed Solution Architecture](#4-detailed-solution-architecture--six-layer-microservices-on-aws)
5. [Actors & Roles](#5-actors--roles)
6. [Key Workflows](#6-key-workflows)
7. [Non-Functional Requirements — Single-Page Pull-Out](#7-non-functional-requirements--single-page-pull-out)
8. [Technology Stack](#8-technology-stack)
9. [Assumptions & Scope](#9-assumptions--scope)
10. [References & Appendix](#10-references--appendix)

---

## 1. Executive Summary

YCompany is a leading United States auto-insurance provider serving more than **200 million customers**. While the company sells policies through fully electronic, well-organised channels, its **claims processing remains manual and paper-driven**. The result is long settlement cycles, payments issued by cheque, no way for customers to track a claim, no electronic collaboration with repair workshops, and no analytical visibility for management. Competitors that already offer faster settlement and continuous status updates are eroding YCompany's market position and customer confidence.

**eClaims** is the proposed modernisation: a cloud-native, microservices-based platform that digitises the **entire motor-claim lifecycle end to end** — from first notification of loss, through survey and adjudication, to repair tracking and electronic payment — and opens it up to every party in the process through three purpose-built portals:

- a **Customer Portal** for policyholders to file and track claims, choose a workshop, book a rental, and pay electronically;
- an **Internal Portal** for the six claims-processing roles (Case Manager, Surveyor, Adjustor, Auditor, Regional Manager, Top Management); and
- a **Partner Portal** for repair workshops and car-rental partners.

Underpinning the portals is an **event-driven microservices backend on AWS** that enforces a governed claim state machine, publishes notifications on every status change (SMS and email), archives every document for audit and compliance, and streams claim data to an analytics warehouse for management reporting and fraud detection.

**Expected business outcomes:**

| Outcome | How eClaims delivers it |
|---|---|
| Dramatically shorter settlement times | Straight-through digital workflow; auto-assignment of staff; electronic survey, adjudication and payment |
| Restored customer confidence | Real-time status tracking and proactive SMS/email alerts at every step |
| Lower operating cost | Removal of manual field-to-back-office paperwork; automated routing; serverless infrastructure that scales with demand |
| Stronger partner relationships | Digital work orders, repair-status updates and **electronic payments to workshops** |
| Data-driven management | Region and enterprise dashboards, ageing matrices, and fraud reporting |
| Enterprise-grade trust | 24×7 self-healing availability, encryption everywhere, RBAC, and an immutable audit trail |

The architecture is designed to comfortably serve YCompany's 200M+ customer base and future growth, to meet the mandated performance target of **99% of requests completing in under 5,000 ms**, and to satisfy security expectations including the **OWASP Top 10** and encryption of sensitive data at rest and in transit. It supports **both cloud and on-premise deployment** through Infrastructure-as-Code, and is built for evolution, flexibility and reuse in line with YCompany's stated design principles.

---

## 2. Problem Statement

YCompany's policy-sales experience is modern and electronic, but the **claims experience is not**. The current, largely manual process creates pain across every stakeholder group:

- **Slow, opaque settlement for customers.** Claims are processed by hand and settled by cheque, producing long settlement times. Customers have **no way to track the state of a claim** and no visibility into when — or how much — they will be paid. This drives dissatisfaction and eroding confidence.
- **Costly, inefficient Adjustor workflow.** Claims Adjustors submit assessments manually from the field to the back office, which then validates them against the submitted claim. The round trip is **both cost-inefficient and time-consuming**.
- **No electronic data, therefore no analytics.** Because claims data is not captured electronically, YCompany **cannot run analytics** on it. Detailed reporting for higher management does not exist, so leadership **cannot make timely business-improvement decisions**.
- **Friction for third-party providers.** Repair workshops and service centres must **wait for the approved claim amount before starting work**, and their payments are also delayed because settlement to providers is not electronic.
- **Loss of competitive edge.** Competitors already provide faster settlement and continuous customer updates, placing YCompany at a growing disadvantage.

In short, the absence of an integrated, electronic, event-driven claims platform is the root cause of slow settlement, poor transparency, high operating cost, weak partner collaboration and an inability to learn from claims data. eClaims addresses each of these directly.

---

## 3. Solution Overview

eClaims is delivered as a set of loosely-coupled, independently-deployable services that together provide six capability areas. Each is described in detail in [Section 4](#4-detailed-solution-architecture--six-layer-microservices-on-aws); the summary below frames what each delivers to the business.

| # | Capability | What it provides |
|---|---|---|
| 1 | **Customer Portal** (web, mobile-ready) | Self-service claim submission with photos and police report; real-time status tracking; partner-workshop lookup and appointment booking; rental-vehicle selection; document upload; electronic payment of dues. |
| 2 | **Internal Portal** | Role-based workbench for all six internal roles — case assignment and delegation, field survey submission, adjudication against policy coverage, read-only audit access, and role-scoped reporting. |
| 3 | **Partner Portal** | Workshop login to upload work orders and estimates, push repair-status and delivery-date updates, submit the final bill, and track payment status; car-rental partners publish their catalogue and confirm bookings. |
| 4 | **Notification Engine** | SMS and email alerts to customers and concerned parties on **every claim status change**; all communications archived for audit and compliance. |
| 5 | **Reporting Module** | Role-based reports — claims processed, processing time, ageing matrix for long-pending claims, fraud reports, and cross-region management KPIs. |
| 6 | **Document Management** | A central, versioned archive of every claim document and communication, retained for auditing and compliance. |

The platform is designed around a **governed claim lifecycle** (Submitted → Assigned → Under Survey → Surveyed → Under Adjudication → Approved / Rejected → Paid), where each transition is permitted only for the correct role and only from a valid preceding state. Every transition raises a domain **event**, which in turn drives notifications, downstream processing and the analytics feed — the mechanism that makes the whole process transparent and near-real-time.

---

## 4. Detailed Solution Architecture — Six-Layer Microservices on AWS

eClaims follows a **layered, microservices reference architecture** deployed on **AWS ECS Fargate** (serverless containers) across multiple Availability Zones. The layering separates concerns cleanly, enabling independent scaling, evolution and reuse — a core YCompany design requirement. The companion diagram (`architecture-diagram.drawio.xml`) renders all six layers, the components in each, and the protocol-annotated data flows between them. The companion file also carries a System Context, a High Level Solution and a technology-agnostic Logical Architecture view ahead of this layered detail (Appendix B).

**Architecture at a glance**

```
Layer 1  Client / Edge          Customer · Internal · Partner SPAs (+ Mobile, Phase 2)
Layer 2  API Gateway / Ingress  WAF+Shield · CloudFront · ALB · Auth (OAuth2/JWT)
Layer 3  Microservices          Core + Support services on ECS Fargate (Multi-AZ)
Layer 4  Async / Messaging      EventBridge · SQS · SNS · Lambda
Layer 5  Data (Polyglot)        PostgreSQL · MongoDB · Redis · OpenSearch · S3 · Redshift
Layer 6  Infrastructure         IAM/SSO · KMS · CloudWatch/X-Ray · CloudTrail · CI/CD · Terraform
```

### Layer 1 — Client / Edge

- **React web portals**, delivered as three separate single-page applications (SPAs) — Customer, Internal and Partner — that share a common component library for consistency and reuse.
- **Mobile app (iOS/Android):** out of scope for the Phase 1 POC but explicitly accommodated in the architecture; the same backend APIs serve web and mobile. The Phase 1 web portals are built responsive (mobile-first) so the experience is usable on a handset immediately.

### Layer 2 — API Gateway / Ingress

- **AWS WAF + Shield** — protection against DDoS and the OWASP Top 10 at the edge.
- **CloudFront CDN** — global caching of static assets, reducing latency and origin load.
- **Application Load Balancer (ALB)** — Multi-AZ, health-checked routing to services.
- **Auth Service (OAuth2 / JWT)** — issues short-lived access tokens (15 minutes) and refresh tokens (7 days); every downstream request is authenticated and authorised.

**Why no managed API Gateway service?** The capabilities a managed API Gateway would normally provide are deliberately delivered by the components above instead of by a separate service: routing/dispatch by the **ALB**; authN/authZ by the **Auth Service** (OAuth2/JWT) plus RBAC and Okta SSO; rate limiting/throttling by **WAF + Shield**; caching by **CloudFront** (edge) and **ElastiCache Redis** (data); canary/blue-green releases by **CodePipeline + CodeDeploy** with ALB weighted target groups; circuit breaking by service-level breakers with exponential backoff; distributed tracing by **CloudWatch + X-Ray**; and request validation in-service (FastAPI + Pydantic). The one capability a managed API Gateway would add uniquely — per-API-key usage plans for metered third-party consumers — isn't required, since partners integrate through the Partner Portal rather than raw metered APIs. This mapping is also called out directly on the architecture diagram (Appendix B).

### Layer 3 — Microservices (ECS Fargate, Multi-AZ)

**Core services**

| Service | Responsibility |
|---|---|
| **Claims Service** (FastAPI) | Create / read / update claims; enforces the claim **state machine** and ownership rules. |
| **Incident Management Service** | Auto-assigns Case Manager, Surveyor and Adjustor by geography (surveyor field-office coverage) and availability; supports delegation. |
| **Workflow Engine** | Orchestrates the claim lifecycle; integrates with **AWS Step Functions** for durable, auditable state. |
| **Notification Service** | Sends SMS (SNS), email (SES) and push notifications on every status change. |
| **Fraud Detection Service** | Rule-based flagging at submission (ML scoring in a later phase). |
| **Reporting Service** | Aggregation queries and PDF/CSV export for role-based reports. |

**Support services**

| Service | Responsibility |
|---|---|
| **Payment Service** (PCI-DSS) | Electronic payment processing via a PCI-DSS Level 1 provider (Stripe); collects customer dues and disburses to partners. |
| **User / RBAC Service** | Manages the six roles and their permissions — **configurable without code changes**. |
| **Document Service** | File upload/download, metadata and versioning (S3 for content, OpenSearch for search). |
| **Location Service** | Partner workshop / car-rental lookup by zip code or geolocation. |
| **Configuration Service** | Feature flags and role-permission configuration, enabling behavioural change without redeployment. |

### Layer 4 — Async / Messaging

- **AWS EventBridge** — the central event bus carrying domain events (`ClaimCreated`, `SurveySubmitted`, `StatusChanged`, `ClaimApproved`, `RepairStatusUpdated`, `PaymentApproved`).
- **AWS SQS** — per-service work queues that decouple producers from consumers and provide retry and back-pressure.
- **AWS SNS** — fan-out for notifications (SMS and topic subscriptions).
- **AWS Lambda** — lightweight, event-driven functions for glue logic and scheduled tasks.

This asynchronous backbone is what turns a status change into an instantaneous notification and an analytics record, without coupling services to one another.

### Layer 5 — Data (Polyglot, Multi-AZ)

A **polyglot persistence** strategy uses the right store for each job:

| Store | Technology | Purpose |
|---|---|---|
| **Claims DB** | RDS PostgreSQL (Multi-AZ) | Primary transactional store for claims and lifecycle history. |
| **User DB** | RDS PostgreSQL (Multi-AZ) | Identity, roles and permissions. |
| **Document DB** | MongoDB Atlas | Rich, flexible document metadata and queries. |
| **Cache** | ElastiCache Redis | Session and claim-status caching for sub-100 ms reads. |
| **Search** | OpenSearch | Full-text document search and workshop geo-search. |
| **Object Storage** | Amazon S3 | Accident photos, PDFs and work orders — versioned and encrypted. |
| **Data Warehouse** | Amazon Redshift | Analytics, management reporting and fraud analytics. |

### Layer 6 — Infrastructure / Platform (Cross-Cutting)

These platform services govern **every layer above** and provide the non-functional backbone:

- **IAM + SSO (Okta)** — centralised identity and single sign-on.
- **Secrets Manager + KMS** — secret rotation and AES-256 encryption at rest.
- **CloudWatch + X-Ray** — structured JSON logs and distributed tracing for debugging any error condition.
- **CloudTrail** — an immutable audit log of every API call (supports non-repudiation).
- **CodePipeline + CodeBuild** — CI/CD with blue-green deployment for zero-downtime releases.
- **Terraform** — Infrastructure-as-Code, enabling **both on-premise and AWS** deployment from one codebase.
- **ECS Fargate** — serverless container orchestration with no EC2 fleet to manage.

---

## 5. Actors & Roles

| Actor | Portal | Key capabilities |
|---|---|---|
| **Customer** | Customer Portal | Submit claim, upload documents, track status, select workshop, book rental, pay electronically |
| **Case Manager** | Internal Portal | Assign / delegate cases, override Surveyor and Adjustor decisions, view full case details, generate reports on received claims |
| **Surveyor** | Internal Portal / Mobile | Submit field damage assessment, update vehicle status |
| **Adjustor** | Internal Portal | Review claim, documents and survey; adjudicate and approve/reject the amount against policy coverage |
| **Auditor** | Internal Portal | Read-only access to all claims and their processing history |
| **Regional Manager** | Internal Portal | Region-level reports: processing time, amounts paid, claim count by geography |
| **Top Management** | Internal Portal | Cross-region dashboard, KPIs and trend analysis |
| **Partner Workshop** | Partner Portal | Upload work order and estimates, update repair status and delivery date, submit final bill, track payment |
| **Car Rental Partner** | Partner Portal | Publish rental-vehicle catalogue, confirm bookings |

Access for every role is enforced by the **User / RBAC Service** and is **configurable without code changes**, satisfying the functional requirement for role behaviour to be reconfigured administratively.

---

## 6. Key Workflows

The four workflows below trace a claim through its full lifecycle. Each numbered step names the acting party and — where relevant — the event that fires. Notifications are omitted from individual steps for brevity but are raised on **every** status change. Each workflow is colour-coded on the architecture diagram's data-flow arrows (Appendix B) so it can be traced visually end to end.

### Workflow 1 — Claim Submission & Assignment

1. Customer logs in and submits a claim (incident details, photos, police report).
2. **Claims Service** generates a Claim ID against the policy and publishes `ClaimCreated`.
3. **Incident Management Service** auto-assigns a Case Manager, Surveyor and Adjustor based on location (surveyor field-office coverage) and availability.
4. **Notification Service** sends SMS/email to the assigned staff and to the customer (claim received, ID confirmed).

### Workflow 2 — Survey & Adjudication

1. Customer selects a partner workshop, books an appointment and drops the vehicle off.
2. **Surveyor** assesses the damage and submits the assessment electronically.
3. `SurveySubmitted` event notifies the **Adjustor**.
4. **Adjustor** reviews the claim, documents and survey, then adjudicates the amount against policy coverage.
5. `ClaimApproved` event notifies the customer of the approved amount and notifies the workshop to proceed.

### Workflow 3 — Repair Tracking & Payment

1. Workshop updates repair status → `RepairStatusUpdated` → customer notified.
2. Workshop updates the delivery date → customer notified of the change.
3. On completion, the workshop submits the final invoice.
4. Customer is notified of the final bill and **pays electronically** from the portal.
5. Workshop tracks payment status via the Partner Portal.

### Workflow 4 — Reporting

1. **Case Manager** generates reports on assigned claims (processing time, pending items).
2. **Regional Manager** views a regional dashboard (amounts paid, claim count, geography).
3. **Top Management** views cross-region KPIs and identifies high-claim regions.

---

## 7. Non-Functional Requirements — Single-Page Pull-Out

> This section is designed as a **stand-alone, single-page summary** for stakeholders who need only the NFR coverage. It maps each requirement from the case study to the concrete architectural implementation that satisfies it.

| NFR | Requirement | Implementation in eClaims |
|---|---|---|
| **Availability** | 24×7 operation; system restarts itself on any crash | Multi-AZ ECS across 3 zones; container health checks every 5 s with automatic restart; RDS Multi-AZ failover in under 60 s |
| **Scalability** | Handle 200M+ customers and future growth; auto-scale to demand | ECS auto-scaling (2–100 tasks per service); database read replicas; SQS-based decoupling; Redis caching |
| **Performance** | 99% of services complete in **< 5,000 ms**, peak and non-peak | Redis L1 cache; CloudFront edge cache; connection pooling; query indexing; continuous P50/P95/P99 latency monitoring |
| **Security** | OWASP Top 10; encryption of sensitive data; RBAC | WAF + Shield; OAuth2 + JWT; RBAC at every layer; KMS AES-256 at rest; TLS 1.2+ in transit; PCI-DSS for payments; full audit trail |
| **Resilience / Reliability** | Self-healing; no single point of failure | Circuit breakers and exponential-backoff retries; blue-green deployment; RTO < 15 min, RPO < 5 min |
| **Observability** | Enough logging to debug any error; SLA monitoring | Structured JSON logs → CloudWatch; X-Ray distributed tracing; CloudTrail audit; custom KPI metrics and automated SLA alerts |
| **Flexibility / Deployability** | No code changes for role config; on-premise **and** cloud | Configuration & RBAC services for administrative role changes; Terraform IaC for both on-premise and AWS |
| **Compliance / Non-Repudiation** | Audit trail; no repudiation; guard against fraud | CloudTrail immutable audit; digital signatures on claim documents; rule-based (then ML) fraud detection; every communication archived |
| **Data management** | Store, back up and recover in a distributed environment | Multi-AZ RDS with automated backups and point-in-time recovery; S3 cross-region replication; versioned object storage |
| **Maintainability** | Testability, configurability, upgradeability | Independently deployable services; automated test suites; blue-green upgrades; feature flags |

---

## 8. Technology Stack

| Component | Technology | Justification |
|---|---|---|
| Backend API | Python **FastAPI** | Async, high performance, automatic OpenAPI generation, strong typing via Pydantic |
| Frontend | **React 18 + TypeScript + Vite** | Component reuse across the three portals, strong ecosystem, type safety |
| Primary database | **PostgreSQL 15** (RDS Multi-AZ) | ACID guarantees for relational claims data, mature, AWS-managed |
| Document database | **MongoDB Atlas** | Flexible schema and rich metadata queries for claim documents |
| Cache | **Redis 7** (ElastiCache) | Sub-millisecond session and claim-status caching |
| Search | **OpenSearch** | Full-text document search and geo-search for workshops |
| Object storage | **Amazon S3** | Virtually unlimited scale, 11-nines durability, native encryption |
| Messaging | **EventBridge + SQS + SNS** | Cloud-native event bus, reliable queuing, fan-out |
| Workflow | **AWS Step Functions** | Managed state machine with a built-in audit trail and no infrastructure to run |
| Notifications | **AWS SES** (email) + **SNS** (SMS) | AWS-native, pay-per-use, compliant delivery |
| Payments | **Stripe** (PCI-DSS Level 1) | Industry-standard, with built-in fraud detection; keeps YCompany out of PCI scope |
| Container orchestration | **AWS ECS Fargate** | Serverless containers, no EC2 fleet to manage |
| Infrastructure-as-Code | **Terraform** | Multi-target (cloud and on-premise), version-controlled infrastructure |
| CI/CD | **AWS CodePipeline + CodeBuild** | AWS-native pipeline with blue-green support |
| Observability | **CloudWatch + X-Ray + CloudTrail** | Native AWS integration with minimal operational overhead |
| Security | **AWS WAF + Shield + KMS + IAM** | Layered, defence-in-depth security across the stack |
| Data warehouse | **Amazon Redshift** | Petabyte-scale analytics for management reporting |
| Identity / SSO | **Okta** (via IAM) | Centralised enterprise identity and single sign-on |

> **Note on the Phase 1 POC.** The accompanying proof of concept implements a representative subset of this stack — FastAPI services, React/TypeScript portals, PostgreSQL and Redis, JWT auth, RBAC and the claim state machine — running locally under Docker Compose. The full AWS-managed services above constitute the target production architecture.

---

## 9. Assumptions & Scope

### In scope

- Customer Portal (web, React)
- Internal Portal (web, React) — all six roles
- Partner Workshop Portal (web, React)
- Claims lifecycle: Submission → Survey → Adjudication → Approval → Payment
- Document management and archival
- SMS/email notifications on every status change
- Role-based reporting (Case Manager, Regional Manager, Top Management)
- Electronic payment (Stripe integration)
- AWS cloud deployment (with Terraform enabling on-premise as well)

### Out of scope (Phase 1)

- Native mobile app (iOS/Android) — web-first, with mobile-responsive design in scope
- Multi-region active-active deployment — the architecture supports it; not implemented in Phase 1
- ML-based fraud detection — a rule-based engine ships in Phase 1; the ML model is a Phase 2 item
- Multi-language support — English only, per the requirements
- Car-rental integration API — the UI is present; the third-party integration is deferred
- Legacy-system migration and historical data backfill

### Assumptions

1. YCompany will adopt **AWS** as its cloud provider.
2. Customer identity is verified via the existing **policy number** at registration.
3. Partner workshops are **pre-registered** in the system by an administrator.
4. Payment is via **Stripe**; PCI-DSS scope is limited to Stripe's hosted payment page.
5. SMS notifications are delivered via **AWS SNS** (US numbers only for Phase 1).
6. Surveyor geo-coverage areas are **pre-configured** in the Location Service.
7. The delivery team has an AWS account with the necessary permissions.
8. Where the case study is silent, reasonable industry-standard assumptions have been made, as permitted by the assignment guidelines.

---

## 10. References & Appendix

### References

| # | Reference | Location |
|---|---|---|
| 1 | eClaims Case Study | `requirements/eClaims - Insurance -Senior Staff Engineer.pdf` |
| 2 | MSAG Diagram Preparation Guidelines v1.1 | `requirements/MSAG-Diagram-Preparation-Guidelines-v1.1.pdf` |
| 3 | eClaims Architecture Diagram (draw.io source) | `docs/sad/architecture-diagram.drawio.xml` |
| 4 | Proof-of-Concept implementation | `README.md`, `src/`, `infrastructure/` |
| 5 | AWS Well-Architected Framework | https://aws.amazon.com/architecture/well-architected/ |
| 6 | OWASP Top 10 | https://owasp.org/www-project-top-ten/ |
| 7 | PCI-DSS Compliance | https://www.pcisecuritystandards.org/ |

### Appendix A — Requirements Traceability Matrix

The matrix confirms that every capability called for in the case study is addressed by a named component of the solution.

| Case-study requirement | Addressed by |
|---|---|
| Customer login via policy details | Auth Service · User/RBAC Service |
| Submit claim with photos / police report | Customer Portal · Claims Service · Document Service (S3) |
| Generate Claim ID on first notice of loss | Claims Service (`ClaimCreated`) |
| Notify Incident Manager, Adjustor, Surveyor | Incident Management Service · Notification Service |
| Constant status updates to customer | Notification Service · EventBridge (status events) |
| Partner-workshop list & appointment by location/zip | Location Service · Customer Portal · Partner Portal |
| Rental-vehicle selection by policy coverage | Location Service · Customer Portal (integration deferred) |
| Surveyor submits assessment online | Internal Portal · Workflow Engine |
| Adjustor adjudicates against policy coverage | Adjudication in Claims Service / Workflow Engine |
| Case Manager delegate / override | Incident Management Service · Claims Service (override) |
| Auditor read-only visibility | RBAC (read-only role) · Reporting Service |
| Workshop uploads work order & estimates | Partner Portal · Document Service |
| Repair-status & delivery-date updates to customer | Partner Portal · Notification Service |
| Electronic final-bill payment | Payment Service (Stripe) |
| Workshop tracks payment status | Payment Service · Partner Portal |
| Role-based reports (processing time, ageing, fraud) | Reporting Service · Redshift · Fraud Detection Service |
| Regional & top-management reporting | Reporting Service · Redshift |
| Central document management for audit/compliance | Document Service (S3 + OpenSearch) · CloudTrail |
| Alerts/notifications on every status change (SMS/email) | Notification Service (SNS + SES) |
| Archive all customer communication | Document Service · S3 (versioned, retained) |
| Identity management with role-based authN/authZ | Okta / IAM · Auth Service · RBAC Service |
| Role actions configurable without code changes | Configuration Service · RBAC Service |
| Encryption of sensitive data at rest | KMS (AES-256) · encrypted RDS/S3 |
| No repudiation & fraud handling | CloudTrail audit · digital signatures · Fraud Detection Service |
| 24×7 with self-restart | Multi-AZ ECS · health checks · auto-restart |
| On-premise **and** cloud deployment | Terraform IaC |
| 99% of requests < 5,000 ms | Redis/CloudFront caching · indexing · latency monitoring |
| OWASP Top 10 protection | WAF + Shield · secure SDLC |

### Appendix B — Architecture Diagram

The full architecture is provided as an editable draw.io / diagrams.net source file at
`docs/sad/architecture-diagram.drawio.xml`. It contains five pages, reading top-down from business
context to implementation detail:

1. **System Context** — eClaims drawn as a single black box against every actor and external system that touches it (MSAG "System Model — functional aspect"). Actors are tagged A1 (Customer) and B1–B6 (the six internal roles), C1–C2 (partners); external systems are tagged D1–D5 (Stripe, Okta, MongoDB Atlas, SNS, SES) and E1–E3 (the deferred car-rental API, customer-supplied evidence, and the open Policy Administration System item). An interaction register beneath the diagram tags each of the 17 flows with what crosses the boundary and over which channel/protocol, cross-referenced to §3, §5, §6 and §8.
2. **High Level Solution** — a single compact one-page view of the entire solution (MSAG "Solution diagram"), aimed at senior stakeholders. Bands A–F run top to bottom (Users, Channels, Secure Edge, Business Capabilities C1–C6, Event Backbone, Information & Cloud Platform E1–E8, External Systems F1–F6), with the end-to-end claim flow numbered ①–⑩ directly on the edges and walked in prose in the notes panel.
3. **Logical Architecture** — a technology-agnostic, layered view (MSAG "Application / Component Logical Architecture") naming roles rather than products, so it applies equally to the cloud or on-premise deployment option (§7). Functional modules are tagged M1–M12 and cross-cutting concerns X1–X12, drawn once in a dedicated right-hand column. See page 4 for the concrete technology mapping of every role shown here.
4. **Layered Solution Architecture** — the six layers as horizontal swim-lanes, every component labelled and colour-coded by layer, with directional data flows annotated by protocol (HTTPS/TLS, OAuth2/JWT, EventBridge/SQS/SNS, SQL, S3 API). Data-flow arrows for the four Section 6 workflows (Claim Submission & Assignment, Survey & Adjudication, Repair Tracking & Payment, Reporting) are colour-coded per workflow with a dedicated Flow Legend, so each business flow can be traced independently of the shared platform/infrastructure flows (shown in grey). The page also carries a capability-mapping callout explaining the Layer 2 API-Gateway design decision (§4) and the standard component-type legend.
5. **Bounded Contexts (Domain View)** — the Customer, Internal and Partner domains and the event backbone that integrates them.

Pages 1–3 are new additions completing the Nagarro MSAG diagram set (`requirements/MSAG-Diagram-Preparation-Guidelines-v1.1.pdf`); pages 4–5 are unchanged from the original two-page deliverable, only re-sequenced within the file.

To view or edit: open the file in the diagrams.net desktop application or at https://app.diagrams.net.
