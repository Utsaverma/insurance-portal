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
| Version | 1.1 |
| Status | Issued for review |
| Date | 30 September 2026 |
| Classification | Confidential |
| Companion artefact | `docs/sad/architecture-diagram.drawio.xml` (draw.io / diagrams.net source) |

### Revision history

| Version | Date | Author | Summary of change |
|---|---|---|---|
| 0.1 | 30 June 2026 | Utsav Verma | Initial draft — structure and problem framing |
| 1.0 | 07 July 2026 | Utsav Verma | Complete architecture, NFR pull-out, technology stack, scope — issued for review |
| 1.1 | 30 September 2026 | Utsav Verma | Added §9 Performance & Scalability; cloud and on-premise deployment options; application-level audit trail; role mapping; POC coverage; references to the DARs and the estimate |

### Table of contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [Detailed Solution Architecture](#4-detailed-solution-architecture--six-layer-microservices-on-aws)
5. [Actors & Roles](#5-actors--roles)
6. [Key Workflows](#6-key-workflows)
7. [Non-Functional Requirements — Single-Page Pull-Out](#7-non-functional-requirements--single-page-pull-out)
8. [Technology Stack](#8-technology-stack)
9. [Performance & Scalability](#9-performance--scalability)
10. [Assumptions & Scope](#10-assumptions--scope)
11. [References & Appendix](#11-references--appendix)

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

The architecture is designed to comfortably serve YCompany's 200M+ customer base and future growth, to meet the mandated performance target of **99% of requests completing in under 5,000 ms**, and to satisfy security expectations including the **OWASP Top 10** and encryption of sensitive data at rest and in transit. It supports **both cloud and on-premise deployment**: services ship as container images that run on AWS in Phase 1 and on Kubernetes on-premise, with each AWS-managed service mapped to a portable equivalent (§4, Deployment Options). It is built for evolution, flexibility and reuse in line with YCompany's stated design principles.

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

![System Context](diagrams/System%20Context.jpg)

*Figure — System Context: eClaims as a single black box against every actor and external system that touches it (Appendix B, page 1).*

![High Level Solution](diagrams/High%20Level%20Solution.jpg)

*Figure — High Level Solution: a single compact view of the entire solution, with the end-to-end claim flow numbered on the edges (Appendix B, page 2).*

The platform is designed around a **governed claim lifecycle** (Submitted → Assigned → Under Survey → Surveyed → Under Adjudication → Approved / Rejected → Paid), where each transition is permitted only for the correct role and only from a valid preceding state. Every transition raises a domain **event**, which in turn drives notifications, downstream processing and the analytics feed — the mechanism that makes the whole process transparent and near-real-time.

---

## 4. Detailed Solution Architecture — Six-Layer Microservices on AWS

eClaims follows a **layered, microservices reference architecture** deployed on **AWS ECS Fargate** (serverless containers) across multiple Availability Zones. The layering separates concerns cleanly, enabling independent scaling, evolution and reuse — a core YCompany design requirement. The companion diagram (`architecture-diagram.drawio.xml`) renders all six layers, the components in each, and the protocol-annotated data flows between them. The companion file also carries a System Context, a High Level Solution and a technology-agnostic Logical Architecture view ahead of this layered detail, and a Cloud / Deployment Architecture view immediately after it translating these six layers into a physical AWS network topology — VPC, Availability Zones, subnets and edge — followed by a dedicated CI/CD Pipeline view (Appendix B).

![Logical Architecture](diagrams/Logical%20Architecture.jpg)

*Figure — Logical Architecture: a technology-agnostic, layered view naming roles rather than products, so it applies equally to the cloud or on-premise deployment option (Appendix B, page 3).*

**Architecture at a glance**

```
Layer 1  Client / Edge          Customer · Internal · Partner SPAs (+ Mobile, Phase 2)
Layer 2  API Gateway / Ingress  Route 53 · WAF+Shield · CloudFront · ALB · Auth (OAuth2/JWT)
Layer 3  Microservices          Core + Support services on ECS Fargate (Multi-AZ)
Layer 4  Async / Messaging      EventBridge · SQS · SNS · Lambda
Layer 5  Data (Polyglot)        PostgreSQL · MongoDB · Redis · OpenSearch · S3 · Redshift
Layer 6  Infrastructure         IAM/SSO · KMS · CloudWatch/X-Ray · CloudTrail · CI/CD · Terraform
```

![Layered Solution Architecture](diagrams/Layered%20Solution%20Architecture.jpg)

*Figure — Layered Solution Architecture: all six layers, their components, and protocol-annotated data flows between them (Appendix B, page 4).*

### Layer 1 — Client / Edge

- **React web portals**, delivered as three separate single-page applications (SPAs) — Customer, Internal and Partner — that share a common component library for consistency and reuse.
- **Mobile app (iOS/Android):** out of scope for the Phase 1 POC but explicitly accommodated in the architecture; the same backend APIs serve web and mobile. The Phase 1 web portals are built responsive (mobile-first) so the experience is usable on a handset immediately.

### Layer 2 — API Gateway / Ingress

- **Amazon Route 53** — DNS resolution and health-checked routing at the entry point.
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
- **CloudTrail** — an immutable log of AWS control-plane and data-access API calls (infrastructure audit).
- **Application audit trail** — every business action (submission, assignment, assessment, approval, override, payment) is written to an append-only, hash-chained audit store. Each record carries the actor, timestamp, source IP, request ID and the previous record's hash. The trail is archived to S3 with Object Lock (WORM), and every claim document's SHA-256 digest is recorded at upload. This, not CloudTrail, provides business-level non-repudiation.
- **CodePipeline + CodeBuild + CodeDeploy** — CI/CD with blue-green deployment for zero-downtime releases; container images stored in **Amazon ECR**.
- **Terraform** — Infrastructure-as-Code for every environment. Terraform versions the infrastructure; it does not make AWS-managed services run on-premise. On-premise portability comes from the container images and the on-premise profile (see *Deployment Options* below).
- **ECS Fargate** — serverless container orchestration with no EC2 fleet to manage.

### Deployment Topology

The diagram's fifth page, **Cloud / Deployment Architecture** (`eclaims-cloud`), translates the six
logical layers above into a physical AWS network topology for **Phase 1: a single AWS Region,
Multi-AZ** (multi-region active-active is a Phase 2 item, §10). Inbound traffic resolves through
**Amazon Route 53** (**G1**) and passes through a global edge tier outside the Region — **G2** AWS
WAF + Shield and **G3** CloudFront — before entering one **Amazon VPC** spread across three
Availability Zones. Each zone repeats the same three-subnet pattern: a public subnet holding the
Multi-AZ Application Load Balancer target (**V1**) and a NAT Gateway (**V2**); a private/app subnet
running the ECS Fargate service tasks (**V3**) — every microservice from Layer 3, including the Auth
Service that Layer 2 groups logically at the edge; and an isolated data subnet with no direct route to
the internet, holding RDS PostgreSQL primary/standby (**V4**), ElastiCache Redis (**V5**) and a
three-node OpenSearch domain (**V6**) for write quorum. AWS-managed, serverless services from Layers
4–6 — EventBridge, SQS, SNS, Lambda, Step Functions, S3, Redshift, Secrets Manager, KMS, IAM,
CloudWatch, X-Ray and CloudTrail (**N1–N12**) — sit outside the VPC's subnets, reached through VPC
endpoints. Only the NAT Gateways carry egress to the external SaaS providers already introduced on
page 1 (**D1–D5**, **E1**, and the still-unconfirmed Policy Administration System, **E3**). The
release workflow that deploys into this runtime is detailed separately on page 6 (below).

![Cloud / Deployment Architecture](diagrams/Cloud%20_%20Deployment%20Architecture.jpg)

*Figure — Cloud / Deployment Architecture: the Phase 1 single-Region, Multi-AZ AWS network topology (Appendix B, page 5).*

### CI/CD Pipeline

The diagram's sixth page, **CI/CD Pipeline** (`eclaims-cicd`), details the release workflow Layer 6
names only in passing — **AWS CodePipeline + CodeBuild + CodeDeploy + Amazon ECR**, a fully-managed,
pay-per-use toolchain with no idle build server to run or patch, chosen over a self-managed
alternative such as Jenkins. A push to the source repository (**P1**, platform not specified in the
case study) triggers **CodePipeline** (**P2**), which runs three stages in sequence through a shared
**Amazon S3** artifact bucket (**P3**) — **Stage 1 Build** (**P4** CodeBuild tests and builds a
container image, pushed to **P5** ECR), **Stage 2 Infrastructure** (**P6** CodeBuild runs `terraform
plan`/`apply` behind a manual approval gate), and **Stage 3 Deploy**, where **CodeDeploy** (**P7**)
provisions a Green Fargate task set (**P11**) alongside the current Blue set (**P10**) on the same ECS
Service (**P9**) shown on the Cloud/Deployment page, shifting ALB traffic (**P8**) gradually and
rolling back automatically on a CloudWatch (**R1**) health alarm — the mechanism behind the
zero-downtime NFR in §7.

![CI/CD Pipeline](diagrams/CI_CD%20Pipeline.jpg)

*Figure — CI/CD Pipeline: the CodePipeline/CodeBuild/CodeDeploy/ECR release workflow, including the blue-green deploy stage (Appendix B, page 6).*

### Deployment Options — Cloud and On-Premise

The case study requires both on-premise and cloud deployment with auto-scaling (NFR 2). Terraform versions
the infrastructure for every environment, but it does not make AWS-managed services run on-premise.
Portability comes from two design choices:

1. **Every service ships as a container image.**
2. **Services reach infrastructure only through adapters** for storage, messaging, workflow and identity. Moving between platforms swaps adapters and configuration, not business logic.

Phase 1 delivers the AWS profile. The on-premise profile below is designed now and implemented if YCompany
mandates on-premise hosting. The Compute and Orchestration DARs name the same fallbacks: Kubernetes for
compute and Camunda for workflow.

| Capability | AWS profile (Phase 1) | On-premise profile |
|---|---|---|
| Container runtime and auto-scaling | ECS on Fargate · ECS Service Auto Scaling | Kubernetes (EKS Anywhere, OpenShift or any CNCF-conformant distribution) · Horizontal Pod Autoscaler + Cluster Autoscaler |
| Workflow | AWS Step Functions | Camunda Platform 8 (self-managed) |
| Event bus and queues | EventBridge · SQS · SNS | Apache Kafka or RabbitMQ |
| Relational data | RDS PostgreSQL (Multi-AZ) | PostgreSQL with Patroni high availability |
| Document metadata | MongoDB Atlas | MongoDB Enterprise (self-managed) |
| Cache | ElastiCache Redis | Redis (Sentinel or Cluster) |
| Search | Amazon OpenSearch Service | OpenSearch (self-managed) |
| Object storage | Amazon S3 (versioning, Object Lock) | MinIO (S3-compatible, object locking) |
| Identity | Okta · IAM | Keycloak, or Okta with on-premise connectors |
| Secrets and keys | Secrets Manager · KMS | HashiCorp Vault |
| Observability | CloudWatch · X-Ray · CloudTrail | Prometheus · Grafana · OpenTelemetry · Loki or ELK |
| Analytics | Amazon Redshift | On-premise data warehouse (e.g. PostgreSQL-based or ClickHouse) |
| CI/CD | CodePipeline · CodeBuild · CodeDeploy · ECR | GitLab CI or Jenkins · Argo CD · Harbor |

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

**Role mapping.**
- The case study asks for the *Incident Manager* to be notified at first notice of loss. In eClaims this responsibility sits with the **Case Manager** role (assumption, §10). A separate Incident Manager role can be added through the RBAC service without code changes if YCompany's organisation requires it.
- The Phase 1 POC implements the Customer role and five internal roles: Case Manager, Surveyor, Adjustor, Auditor and Regional Manager. Top Management is part of the target solution.

![Bounded Contexts (Domain View)](diagrams/Bounded%20Contexts%20(Domain%20View).jpg)

*Figure — Bounded Contexts: the Customer, Internal and Partner domains and the event backbone that integrates them (Appendix B, page 7).*

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
| **Scalability** | Handle 200M+ customers and future growth; auto-scale to demand | ECS target-tracking auto-scaling (minimum 2 tasks per service across AZs; maximum sized from the workload model, ceiling 100); read replicas, RDS Proxy and table partitioning; SQS buffering; Redis caching — see §9 |
| **Performance** | 99% of services complete in **< 5,000 ms**, peak and non-peak | Redis L1 cache; CloudFront edge cache; connection pooling; query indexing; slow work kept off the request path (asynchronous integrations, direct-to-S3 uploads, asynchronous reports); continuous P50/P95/P99 latency monitoring; latency budget and load-test gates in §9 |
| **Security** | OWASP Top 10; encryption of sensitive data; RBAC | WAF + Shield; OAuth2 + JWT; RBAC at every layer; KMS AES-256 at rest; TLS 1.2+ in transit; PCI-DSS for payments; full audit trail |
| **Resilience / Reliability** | Self-healing; no single point of failure | Circuit breakers and exponential-backoff retries; blue-green deployment; RTO < 15 min, RPO < 5 min for an Availability Zone failure (cross-region recovery is a Phase 2 item) |
| **Observability** | Enough logging to debug any error; SLA monitoring | Structured JSON logs → CloudWatch; X-Ray distributed tracing; CloudTrail audit; custom KPI metrics and automated SLA alerts |
| **Flexibility / Deployability** | No code changes for role config; on-premise **and** cloud | Configuration & RBAC services for administrative role changes; container images plus an on-premise profile on Kubernetes with a portable equivalent for each managed service (§4, Deployment Options); Terraform for every environment |
| **Compliance / Non-Repudiation** | Audit trail; no repudiation; guard against fraud | Append-only, hash-chained application audit trail archived with S3 Object Lock (WORM); SHA-256 digest of every claim document recorded at upload; CloudTrail for infrastructure audit; rule-based (then ML) fraud detection; every communication archived |
| **Data management** | Store, back up and recover in a distributed environment | Multi-AZ RDS with automated backups and point-in-time recovery; S3 cross-region replication; versioned object storage |
| **Maintainability** | Testability, configurability, upgradeability | Independently deployable services; automated test suites; blue-green upgrades; feature flags |

---

## 8. Technology Stack

| Component | Technology | Justification |
|---|---|---|
| Backend API | Python **FastAPI** | Async, high performance, automatic OpenAPI generation, strong typing via Pydantic |
| Data access | **SQLAlchemy 2.0 (async)** with **Alembic** migrations | Typed async ORM over PostgreSQL; versioned, reviewable schema migrations per service (the POC seeds its schema from SQL scripts) |
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
| Infrastructure-as-Code | **Terraform** | Version-controlled infrastructure for every environment; providers exist for AWS and for on-premise platforms (Kubernetes, vSphere) |
| CI/CD | **AWS CodePipeline + CodeBuild + CodeDeploy + Amazon ECR** | AWS-native pipeline with blue-green support |
| Observability | **CloudWatch + X-Ray + CloudTrail** | Native AWS integration with minimal operational overhead |
| Security | **AWS WAF + Shield + KMS + IAM** | Layered, defence-in-depth security across the stack |
| Data warehouse | **Amazon Redshift** | Petabyte-scale analytics for management reporting |
| Identity / SSO | **Okta** (via IAM) | Centralised enterprise identity and single sign-on |

### POC coverage

The accompanying proof of concept (POC) is a *minimal working* slice of this architecture, running locally
under Docker Compose (see `README.md`). It demonstrates the layered services, role-based access and the
governed claim lifecycle. The table maps each target component to its POC stand-in.

| Target component (production) | POC stand-in |
|---|---|
| Edge — CloudFront, WAF, ALB | nginx reverse proxy per portal, with security headers |
| Auth Service (OAuth2/JWT, Okta SSO) | `auth-service` (FastAPI): JWT access and refresh tokens, bcrypt password hashing, rate-limited login |
| Claims Service + Workflow Engine (Step Functions) | `claims-service` (FastAPI) with an in-service, role-gated state machine — the baseline option evaluated in the Orchestration DAR |
| User/RBAC + Configuration Service | Role checks inside the services (fixed in code for the POC; administrative configuration is the target) |
| Notification Service (SNS/SES) | Notification hook: each status change is recorded and logged, not delivered |
| Document Service (S3 + OpenSearch) | Type- and size-validated uploads stored on a local volume |
| Cache (ElastiCache Redis) | Redis |
| Claims DB and User DB (RDS PostgreSQL) | One PostgreSQL instance shared by both services (POC simplification) |
| Reporting Service + Redshift | Reports page in the Internal Portal |
| Observability (CloudWatch, X-Ray) | Structured JSON logs with request-ID correlation across services |
| ECS Fargate, CI/CD, Terraform | Docker Compose |

These components are **not in the POC**; the architecture and the estimate cover them:
- Partner Portal
- Payment Service
- Incident Management auto-assignment
- Fraud Detection
- Location Service
- the mobile app

---

## 9. Performance & Scalability

This section shows how eClaims meets three NFRs:
- handle increased load in future (NFR 1);
- auto-scale to demand (NFR 2);
- complete **99% of requests in under 5,000 ms** in both peak and non-peak hours (NFR 3).

The approach has four parts:
1. Size the platform from an explicit workload model.
2. Keep the synchronous request path short and push slow work to asynchronous processing.
3. Scale each tier independently.
4. Prove the target with load tests before go-live.

### 9.1 Workload model

The case study gives only the customer base, so the figures below are **planning assumptions** to be
validated against YCompany's historical claims data during requirements.

| Driver | Planning value | Basis |
|---|---|---|
| Customers | 200 million | Case study |
| New claims per year | 12 million | Assumed 6% annual claim frequency (the same basis as the Orchestration DAR) |
| Average new claims per day | ≈33,000 | 12 million ÷ 365 |
| Catastrophe-day peak | ≈330,000 first notices of loss per day | 10× average; hail and hurricane events concentrate claims |
| Open claims at any time | ≈1.0 million | ≈30-day average claim lifecycle |
| API calls per claim over its lifecycle | ≈50 | Status checks, staff actions, partner updates |
| API throughput, normal peak hour | ≈70 requests/s | 15% of the daily 1.64 million calls in the busiest hour |
| API throughput, catastrophe peak | ≈700 requests/s | 10× normal peak |
| **Design point** | **1,000 requests/s sustained, 2,000 requests/s burst** | ≈1.4× the catastrophe peak, with headroom for logins, dashboards and partner look-ups |
| Documents | ≈10 per claim × ≈2 MB → ≈240 TB per year | Photos, police report, survey report, work orders |
| Notifications | ≈30 per claim → ≈360 million per year | ≈10 status changes × SMS and email × customer and partner |

Two consequences shape the design:
- **Writes are modest.** First-notice-of-loss writes peak at roughly 14 per second even on a catastrophe day.
- **The load is read-heavy and bursty.** Storage grows steadily at about 240 TB of documents and about 120 million status-history rows a year.

### 9.2 Latency budget for "99% of requests under 5,000 ms"

The SLO is measured at the load balancer for every synchronous API request. eClaims sets tighter internal
targets so the mandated budget is never approached:
- **p99 under 1,000 ms for reads**;
- **p99 under 2,000 ms for writes**.

| Stage | Typical | p99 budget |
|---|---|---|
| Edge — CloudFront, WAF, ALB | 20–60 ms | 300 ms |
| Token validation (signature check with cached keys, in-service) | < 5 ms | 20 ms |
| Service logic | 10–50 ms | 300 ms |
| Cache read (Redis) | ≈1 ms | 20 ms |
| Database query (indexed, partition-pruned) | 5–30 ms | 500 ms |
| **Total synchronous request** | **≈100–200 ms** | **≤1,000 ms (reads) · ≤2,000 ms (writes) vs the mandated 5,000 ms** |

Six design rules keep the 99th percentile inside the budget:
1. **Nothing slow on the request path.** SMS and email, payment callbacks, workshop integrations, fraud scoring and report generation run asynchronously through EventBridge and SQS.
2. **Uploads bypass the API.** Browsers and the mobile app upload photos and PDFs directly to S3 with pre-signed URLs; the API only registers metadata. A 10 MB photo on a slow mobile link never counts against API latency.
3. **Reports are asynchronous.** Management reports are generated from Redshift as jobs and delivered as a link or notification. They never query the transactional database in the request path.
4. **Every outbound call is bounded.** Each has a timeout of at most 2 s, one retry with jitter, and a circuit breaker.
5. **Lists are paginated.** At most 100 items per page, served from indexed queries or read replicas.
6. **Hot reads are cached.** Claim status and reference data (policy snapshot, partner directory) sit in Redis with short TTLs and event-driven invalidation.

### 9.3 Scaling strategy by tier

| Tier | How it scales | Trigger and limits |
|---|---|---|
| Edge | CloudFront caches the portals' static assets globally; WAF rate-based rules shed abusive traffic | Managed by AWS |
| Microservices (ECS Fargate) | Stateless tasks behind the ALB with target-tracking auto-scaling | CPU at 60% or ALB requests per target. Minimum 2 tasks per service across AZs; maximum per service from §9.4 (ceiling 100). Cool-downs: 60 s scale-out, 300 s scale-in. Scheduled pre-scaling for known peaks; a catastrophe runbook for manual pre-scaling |
| Asynchronous processing (SQS consumers, Lambda) | Scales on queue depth; SQS absorbs bursts so API latency is unaffected | Age of oldest message > 60 s; dead-letter queues for poison messages |
| Cache (ElastiCache Redis) | Cluster mode with replicas | Memory > 70% or CPU > 60% |
| Transactional database (RDS PostgreSQL, Multi-AZ) | Vertical scaling for writes; read replicas for queues and status reads; RDS Proxy pools connections as tasks scale out; monthly partitions for status history and communications; claims partitioned by creation month beyond 100 million rows | Replica lag < 1 s; CPU < 70% |
| Search (OpenSearch) | Add data nodes; index lifecycle management | JVM memory pressure, storage |
| Object storage (S3) | Unlimited. Lifecycle tiering: Standard → Standard-IA after 90 days → Glacier Deep Archive one year after claim closure. Object Lock for retention | — |
| Analytics (Redshift) | Change-data-capture feed from the transactional store (a CQRS read model); concurrency scaling for month-end reporting | Queue wait time |
| Notifications (SNS, SES) | Queued through SQS; sending quotas raised before go-live and before known peak seasons | Throttling metrics |

### 9.4 Initial capacity sizing

**Planning assumption:** a 1 vCPU / 2 GB task — the task size in the Compute DAR's cost basis, which
averages three such tasks per service — sustains about 100 requests/s of typical claims traffic at a p99
under 1 s. This is confirmed or corrected in the first load test.

At the 1,000 requests/s design point, the busiest service (Claims) needs about 10 tasks. Starting limits:

| Services | Minimum tasks | Maximum tasks | Headroom at the design point |
|---|---|---|---|
| Claims Service | 2 | 20 | 2× |
| Other services | 2 | 10 | Load is proportionally lower |

The ceiling of 100 tasks per service stays as the upper bound for growth beyond the model. The Compute DAR
carries the corresponding cost basis.

### 9.5 Performance engineering and verification

- **Load tests** use k6 in a production-like staging environment, with per-endpoint p50/p95/p99 reported for three profiles:
  - normal peak hour;
  - a catastrophe spike at the 1,000 requests/s design point;
  - an 8-hour soak.
- **Exit criteria for go-live:**
  - p99 under 5,000 ms at the design point (internal targets: reads under 1,000 ms, writes under 2,000 ms);
  - error rate under 0.1%;
  - no queue backlog older than 5 minutes.
- **Continuous monitoring:**
  - CloudWatch and X-Ray latency percentiles per endpoint;
  - an early-warning alarm when p99 exceeds 2,500 ms (half the budget);
  - synthetic canaries for first notice of loss, status check and approval, run every minute.
- **In the pipeline:** a short k6 run on every release candidate; the full suite before major releases and before known peak seasons.
- **Capacity reviews:**
  - each quarter, against actual claim volumes;
  - a catastrophe runbook: pre-scale services, raise SMS and email quotas, route status reads to replicas.

The POC runs the same synchronous design at small scale under Docker Compose and is not performance-tested.
Load testing is part of the Testing phase in the estimate.

---

## 10. Assumptions & Scope

### In scope

- Customer Portal (web, React)
- Internal Portal (web, React) — all six roles
- Partner Workshop Portal (web, React)
- Claims lifecycle: Submission → Survey → Adjudication → Approval → Payment
- Document management and archival
- SMS/email notifications on every status change
- Role-based reporting (Case Manager, Regional Manager, Top Management)
- Electronic payment (Stripe integration)
- AWS cloud deployment; on-premise deployment profile designed (§4, Deployment Options)

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
9. The *Incident Manager* named in the case study is fulfilled by the **Case Manager** role; a dedicated role can be configured if required.
10. Phase 1 is delivered on AWS. The on-premise profile (§4, Deployment Options) is designed but implemented only if YCompany mandates on-premise hosting; that implementation is not part of the Phase 1 estimate.
11. The workload figures in §9.1 are planning assumptions (6% annual claim frequency, ≈30-day claim lifecycle), to be validated against YCompany's claims data.

---

## 11. References & Appendix

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
| 8 | DAR — Workflow Orchestration Engine | `docs/dar/Utsav_eClaims_DAR_Orchestration_Engine.docx` |
| 9 | DAR — Backend Framework | `docs/dar/Utsav_eClaims_DAR_Backend.docx` |
| 10 | DAR — Compute Platform | `docs/dar/Utsav_eClaims_DAR_Compute.docx` |
| 11 | DAR — Container Orchestrator (Amazon ECS vs Amazon EKS) | `docs/dar/Utsav_eClaims_DAR_ECS_vs_EKS.docx` |
| 12 | Effort estimate, schedule and resource plan | `docs/estimation/Utsav_eClaims_Estimates.xlsm` |

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
| Central document management for audit/compliance | Document Service (S3 with versioning and Object Lock + OpenSearch) · application audit trail |
| Alerts/notifications on every status change (SMS/email) | Notification Service (SNS + SES) |
| Archive all customer communication | Document Service · S3 (versioned, retained) |
| Identity management with role-based authN/authZ | Okta / IAM · Auth Service · RBAC Service |
| Role actions configurable without code changes | Configuration Service · RBAC Service |
| Encryption of sensitive data at rest | KMS (AES-256) · encrypted RDS/S3 |
| No repudiation & fraud handling | Hash-chained application audit trail · document SHA-256 digests · S3 Object Lock · Fraud Detection Service |
| 24×7 with self-restart | Multi-AZ ECS · health checks · auto-restart |
| On-premise **and** cloud deployment | Container images · on-premise profile on Kubernetes (§4, Deployment Options) · Terraform |
| 99% of requests < 5,000 ms | Workload model, latency budget and load-test gates (§9) · caching · asynchronous processing |
| OWASP Top 10 protection | WAF + Shield · secure SDLC |

### Appendix B — Architecture Diagram

The full architecture is provided as an editable draw.io / diagrams.net source file at
`docs/sad/architecture-diagram.drawio.xml`. It contains seven pages, reading top-down from business
context to implementation detail:

1. **System Context** — eClaims drawn as a single black box against every actor and external system that touches it (MSAG "System Model — functional aspect"). Actors are tagged A1 (Customer) and B1–B6 (the six internal roles), C1–C2 (partners); external systems are tagged D1–D5 (Stripe, Okta, MongoDB Atlas, SNS, SES) and E1–E3 (the deferred car-rental API, customer-supplied evidence, and the open Policy Administration System item). An interaction register beneath the diagram tags each of the 17 flows with what crosses the boundary and over which channel/protocol, cross-referenced to §3, §5, §6 and §8.
2. **High Level Solution** — a single compact one-page view of the entire solution (MSAG "Solution diagram"), aimed at senior stakeholders. Bands A–F run top to bottom (Users, Channels, Secure Edge, Business Capabilities C1–C6, Event Backbone, Information & Cloud Platform E1–E8, External Systems F1–F6), with the end-to-end claim flow numbered ①–⑩ directly on the edges and walked in prose in the notes panel.
3. **Logical Architecture** — a technology-agnostic, layered view (MSAG "Application / Component Logical Architecture") naming roles rather than products, so it applies equally to the cloud or on-premise deployment option (§7). Functional modules are tagged M1–M12 and cross-cutting concerns X1–X12, drawn once in a dedicated right-hand column. See page 4 for the concrete technology mapping of every role shown here.
4. **Layered Solution Architecture** — the six layers as horizontal swim-lanes, every component labelled and colour-coded by layer, with directional data flows annotated by protocol (HTTPS/TLS, OAuth2/JWT, EventBridge/SQS/SNS, SQL, S3 API). Data-flow arrows for the four Section 6 workflows (Claim Submission & Assignment, Survey & Adjudication, Repair Tracking & Payment, Reporting) are colour-coded per workflow with a dedicated Flow Legend, so each business flow can be traced independently of the shared platform/infrastructure flows (shown in grey). The page also carries a capability-mapping callout explaining the Layer 2 API-Gateway design decision (§4) and the standard component-type legend.
5. **Cloud / Deployment Architecture** — the AWS network-topology realisation of the six layers above (MSAG "System Model — Technical aspect": deployment type, network type, data transmission), for the Phase 1 single-Region, Multi-AZ footprint (§10). Every component is drawn with real AWS Architecture Icons inside proper AWS group containers (Region/VPC/AZ/Subnet/Security-Group) rather than this file's usual plain colour blocks — scoped to this page and page 6 only. Amazon Route 53 (G1) fronts a global edge tier (G2 WAF + Shield, G3 CloudFront) ahead of one VPC spread across three Availability Zones, each repeating a public/private/data three-subnet pattern tagged V1–V6 (ALB target, NAT Gateway, ECS Fargate tasks, RDS Multi-AZ, ElastiCache Redis, OpenSearch); AWS-managed services reached via VPC endpoints are tagged N1–N12; the same external SaaS providers as page 1 are tagged D1–D5/E1, with the open Policy Administration System item (E3) carried through in the same to-be-confirmed styling.
6. **CI/CD Pipeline** — the release workflow behind Layer 6's CodePipeline/CodeBuild/CodeDeploy/ECR toolchain, chosen for its fully-managed, pay-per-use cost profile over a self-run alternative like Jenkins. A source push (P1, platform not specified in the case study) triggers CodePipeline (P2) through three sequential stages — Build (P4 CodeBuild → P5 ECR), Infrastructure (P6 CodeBuild running Terraform plan/apply behind a manual approval gate), and Deploy — where CodeDeploy (P7) performs a blue/green release into the same Multi-AZ ECS Fargate service shown on page 5, shifting ALB traffic between the Blue (P10) and Green (P11) task sets and rolling back automatically on a CloudWatch alarm (R1).
7. **Bounded Contexts (Domain View)** — the Customer, Internal and Partner domains and the event backbone that integrates them.

Pages 1–3, 5 and 6 are new additions completing the Nagarro MSAG diagram set (`requirements/MSAG-Diagram-Preparation-Guidelines-v1.1.pdf`); pages 4 and 7 are unchanged from the original two-page deliverable, only re-sequenced within the file.

To view or edit: open the file in the diagrams.net desktop application or at https://app.diagrams.net.
