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
| Version | 1.9 |
| Status | Issued for review |
| Date | 30 October 2026 |
| Classification | Confidential |
| Companion artefact | `docs/sad/architecture-diagram.drawio.xml` (draw.io / diagrams.net source) |

### Revision history

| Version | Date | Author | Summary of change |
|---|---|---|---|
| 0.1 | 30 June 2026 | Utsav Verma | Initial draft — structure and problem framing |
| 1.0 | 07 July 2026 | Utsav Verma | Complete architecture, NFR pull-out, technology stack, scope — issued for review |
| 1.1 | 30 September 2026 | Utsav Verma | Added §9 Performance & Scalability; cloud and on-premise deployment options; application-level audit trail; role mapping; POC coverage; references to the DARs and the estimate |
| 1.2 | 29 October 2026 | Utsav Verma | Multi-Region deployment in Phase 1: us-east-1 primary and us-east-2 warm standby; one regional ALB per Region; named Availability Zones; failover runbook and Region RTO/RPO targets |
| 1.3 | 29 October 2026 | Utsav Verma | Removed MongoDB Atlas: document metadata moves to RDS PostgreSQL (JSONB for flexible attributes), so no data store is reached over internet egress; diagram external systems renumbered D1–D4 |
| 1.4 | 29 October 2026 | Utsav Verma | POC coverage brought up to date: workflow rules and role permissions held in the database, notifications delivered through a transactional outbox, a policy table standing in for the Policy Administration System; the mobile app noted as outside the Phase 1 estimate; Appendix B page history corrected |
| 1.5 | 29 October 2026 | Utsav Verma | Layered Solution Architecture (Appendix B, page 4) brought in line with §4, §6 and §9: every workflow step drawn; Route 53, the application audit trail, SES and the Policy Administration System added; tokens checked in each service with cached keys; uploads straight to S3; fraud scoring on `ClaimCreated`; a change-data-capture feed into Redshift |
| 1.6 | 29 October 2026 | Utsav Verma | Region failover for workflow executions: a claim's Step Functions execution is rebuilt in the active Region on its next action, side effects run only in the active Region, failback stops superseded executions, and Step Functions quotas are sized for open claims in both Regions |
| 1.7 | 29 October 2026 | Utsav Verma | Policy Administration System (E3) confirmed by YCompany: drawn as an external system on Appendix B pages 1–5 instead of an open item, the open-item legend entries removed, and Assumption 12 added |
| 1.8 | 30 October 2026 | Utsav Verma | References: the Container Orchestrator DAR (Amazon ECS vs Amazon EKS) is folded into the Compute DAR, which now covers both the compute model and the orchestrator; the Messaging, Analytics and Identity DAR and the Document Management DAR added |
| 1.9 | 30 October 2026 | Utsav Verma | Gaps closed across the SAD and every page of Appendix B: payments with a Payment DB, Stripe's hosted payment page, webhooks and Stripe Connect payouts to workshops and customers; fraud flags with a Fraud Review hold; Policy Administration System checks at registration, submission, adjudication and rental booking, and profile changes passed to it; the communications archive; document validation and the claim–document link; new Repair & Work Order and Booking services; a database per service behind RDS Proxy, an in-Region read replica and a separate audit store; the transactional outbox, dead-letter queues and an event catalogue; zero-ETL into Redshift; EventBridge Scheduler for SLA and ageing alerts; the extended claim lifecycle and a report catalogue; the mobile app moved into Phase 1 (not yet in the estimate); environments, security scans, k6 and synthetic canaries in CI/CD |

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

**eClaims** is the proposed modernisation: a cloud-native, microservices-based platform that digitises the **entire motor-claim lifecycle end to end** — from first notification of loss, through survey and adjudication, to repair tracking and electronic payment — and opens it up to every party in the process through three purpose-built portals and a mobile app:

- a **Customer Portal** for policyholders to file and track claims, choose a workshop, book a rental, and pay electronically;
- an **Internal Portal** for the six claims-processing roles (Case Manager, Surveyor, Adjustor, Auditor, Regional Manager, Top Management);
- a **Partner Portal** for repair workshops, authorised service stations and car-rental partners; and
- a **Mobile App** (iOS and Android) for customers and for surveyors in the field.

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
| 1 | **Customer Portal** (web) and **Mobile App** (iOS/Android) | Self-service claim submission with photos and police report; real-time status tracking; partner-workshop lookup and appointment booking; rental-vehicle selection; document upload; electronic payment of dues; profile changes (correspondence address and billing cycle, held in YCompany's Policy Administration System). |
| 2 | **Internal Portal** | Role-based workbench for all six internal roles — case assignment and delegation, field survey submission (also from the mobile app, offline), adjudication against policy coverage, fraud review, read-only audit access, and role-scoped reporting — plus an administration console for role permissions, workflow and fraud rules, SLA thresholds and the partner directory. |
| 3 | **Partner Portal** | Workshop and authorised-service-station login to receive appointments, upload work orders and estimates, push repair-status and delivery-date updates, submit the final bill, and track payment status; car-rental partners publish their catalogue and confirm bookings. |
| 4 | **Notification Engine** | SMS, email and push alerts to customers and concerned parties on **every claim status change**, and SLA alerts to staff when a claim exceeds its time-to-resolve threshold; all communications archived for audit and compliance. |
| 5 | **Reporting Module** | Role-based reports — claims processed by role, processing time, ageing matrix for long-pending claims, fraud reports, and cross-region management KPIs (report catalogue in §6). |
| 6 | **Document Management** | A central, versioned archive of every claim document and communication, retained for auditing and compliance; every upload validated and malware-scanned before it joins its claim. |

![System Context](diagrams/System%20Context.jpg)

*Figure — System Context: eClaims as a single black box against every actor and external system that touches it (Appendix B, page 1).*

![High Level Solution](diagrams/High%20Level%20Solution.jpg)

*Figure — High Level Solution: a single compact view of the entire solution, with the end-to-end claim flow numbered on the edges (Appendix B, page 2).*

The platform is designed around a **governed claim lifecycle** (Submitted → Assigned → Under Survey → Surveyed → Under Adjudication → Approved / Rejected → In Repair → Invoiced → Paid → Closed), where each transition is permitted only for the correct role and only from a valid preceding state. Three further states handle exceptions: **Fraud Review**, a hold that any open claim can enter when a fraud flag is raised; **Withdrawn**, chosen by the customer before approval; and **Reopened**, set by the Case Manager to send a closed claim back to adjudication. A repair at an external workshop goes from Approved straight to Invoiced when the customer uploads the workshop's invoice. Every transition raises a domain **event**, which in turn drives notifications, downstream processing and the analytics feed — the mechanism that makes the whole process transparent and near-real-time.

---

## 4. Detailed Solution Architecture — Six-Layer Microservices on AWS

eClaims follows a **layered, microservices reference architecture** deployed on **AWS ECS Fargate** (serverless containers) across three Availability Zones in **us-east-1**, with a warm standby in **us-east-2**. The layering separates concerns cleanly, enabling independent scaling, evolution and reuse — a core YCompany design requirement. The companion diagram (`architecture-diagram.drawio.xml`) renders all six layers, the components in each, and the protocol-annotated data flows between them. The companion file also carries a System Context, a High Level Solution and a technology-agnostic Logical Architecture view ahead of this layered detail, and a Cloud / Deployment Architecture view immediately after it translating these six layers into a physical AWS network topology — VPC, Availability Zones, subnets and edge — followed by a dedicated CI/CD Pipeline view (Appendix B).

![Logical Architecture](diagrams/Logical%20Architecture.jpg)

*Figure — Logical Architecture: a technology-agnostic, layered view naming roles rather than products, so it applies equally to the cloud or on-premise deployment option (Appendix B, page 3).*

**Architecture at a glance**

```
Layer 1  Client / Edge          Customer · Internal · Partner SPAs · Mobile App (iOS/Android)
Layer 2  API Gateway / Ingress  Route 53 + ARC · WAF+Shield · CloudFront · ALB · Auth (OAuth2/JWT)
Layer 3  Microservices          Core + Support services on ECS Fargate (Multi-AZ)
Layer 4  Async / Messaging      Outbox relay · EventBridge · SQS (+DLQs) · SNS · EventBridge Scheduler · Lambda
Layer 5  Data (Polyglot)        PostgreSQL per service (RDS Proxy) · Redis · OpenSearch · S3 · Redshift (zero-ETL)
Layer 6  Infrastructure         IAM/SSO · KMS · Audit trail · CloudWatch/X-Ray/Synthetics · CloudTrail · GuardDuty · CI/CD · Terraform
```

![Layered Solution Architecture](diagrams/Layered%20Solution%20Architecture.jpg)

*Figure — Layered Solution Architecture: all six layers, their components, and protocol-annotated data flows between them, with the five Section 6 workflows traced end to end (Appendix B, page 4).*

### Layer 1 — Client / Edge

- **React web portals**, delivered as three separate single-page applications (SPAs) — Customer, Internal and Partner — that share a common component library for consistency and reuse. The Internal Portal includes the administration console, and all three are built responsive (mobile-first).
- **Mobile App (iOS/Android), Phase 1:** one **React Native** app with role-based screens. Customers file and track claims, upload photos, book workshops and rentals, pay and change their profile; surveyors capture field assessments offline — drafts and photos are kept encrypted on the device and synchronised with an idempotent submission when the connection returns. Staff sign in with Okta through the Auth Service. The app calls the same APIs as the web portals, uploads straight to S3, and receives push notifications through Amazon SNS mobile push (APNs and FCM). It is in Phase 1 scope but not yet in the effort estimate (§10, Assumption 13).

### Layer 2 — API Gateway / Ingress

- **Amazon Route 53** — DNS resolution at the entry point, and failover routing between the two Regions: CloudFront's origin hostname is a failover record with us-east-1 as primary and us-east-2 as secondary.
- **Route 53 Application Recovery Controller (ARC) routing controls** — the failover runbook's switch between Regions. Its data-plane API is served from five Regions, so the switch works while us-east-1 is impaired, and a recovered us-east-1 cannot take traffic back on its own.
- **AWS WAF + Shield** — protection against DDoS and the OWASP Top 10 at the edge, with AWS WAF account takeover prevention on the sign-in endpoints.
- **CloudFront CDN** — global caching with two origins: an S3 bucket holding the three portals' static files, reached through origin access control, and the regional ALB for API calls.
- **Application Load Balancer (ALB)** — one regional ALB per Region with a node in each Availability Zone; health-checked routing to services through one target group per service that spans all three zones. It accepts traffic only from CloudFront (the CloudFront managed prefix list in its security group, plus a secret origin header), so WAF cannot be bypassed. Routes: `/auth`, `/users`, `/admin`, `/claims`, `/assignments`, `/documents`, `/locations`, `/bookings`, `/repairs`, `/payments` (including Stripe's `/payments/webhooks`) and `/reports`.
- **Auth Service (OAuth2 / JWT)** — issues short-lived access tokens (15 minutes) and refresh tokens (7 days); every downstream request is authenticated and authorised. Customers register with their policy number, checked against the Policy Administration System (E3); customers and partners use MFA; staff are federated from Okta (Messaging, Analytics and Identity DAR).

**Why no managed API Gateway service?** The capabilities a managed API Gateway would normally provide are deliberately delivered by the components above instead of by a separate service: routing/dispatch by the **ALB**; authN/authZ by the **Auth Service** (OAuth2/JWT) plus RBAC and Okta SSO; rate limiting/throttling by **WAF + Shield**; caching by **CloudFront** (edge) and **ElastiCache Redis** (data); canary/blue-green releases by **CodePipeline + CodeDeploy** with ALB weighted target groups; circuit breaking by service-level breakers with exponential backoff; distributed tracing by **CloudWatch + X-Ray**; and request validation in-service (FastAPI + Pydantic). The one capability a managed API Gateway would add uniquely — per-API-key usage plans for metered third-party consumers — isn't required, since partners integrate through the Partner Portal rather than raw metered APIs. This mapping is also called out directly on the architecture diagram (Appendix B).

### Layer 3 — Microservices (ECS Fargate, Multi-AZ)

**Core services**

| Service | Responsibility |
|---|---|
| **Claims Service** (FastAPI) | Create / read / update claims; enforces the claim **state machine** and ownership rules with the role permissions it reads from the Configuration Service. Checks the policy with the Policy Administration System (E3) at first notice of loss and the cover again at adjudication. Owns the Claims DB — claims, status history, assignments, the policy snapshot, the fraud hold and the claim's workflow execution — and records assignment, document, repair, invoice, payment and fraud events against the claim. |
| **Incident Management Service** | Auto-assigns Case Manager, Surveyor and Adjustor from the staff roster and availability (User / RBAC Service), surveyor field-office coverage (Location Service) and current workload (Claims read replica); supports delegation by the Case Manager; publishes `ClaimAssigned`. |
| **Workflow Engine** | Orchestrates the claim lifecycle on **AWS Step Functions** — one execution per open claim, started at first notice of loss — for durable, auditable state, with workflow rules from the Configuration Service. |
| **Repair & Work Order Service** | Owns the Repair DB: work orders and estimates, repair status, expected delivery dates and final invoices from partner workshops, and invoices from external workshops that the customer uploads. Publishes `WorkOrderUploaded`, `RepairStatusUpdated`, `DeliveryDateChanged` and `InvoiceSubmitted`. |
| **Booking Service** | Owns the Booking DB: workshop appointments and rental bookings. Sends the workshop the initial accident details with each appointment (`AppointmentBooked`); checks rental eligibility against the policy cover in E3 and books the rental through the Partner Portal in Phase 1, the car-rental API later (`RentalBooked`). |
| **Notification Service** | Sends SMS (SNS), email (SES) and push notifications (SNS mobile push) on every status change and SLA breach, using contact details and preferences from the User / RBAC Service. Archives every rendered message in the communications bucket and keeps its delivery record in the Notification DB. |
| **Fraud Detection Service** | Rule-based scoring on `ClaimCreated`, `DocumentUploaded` and `InvoiceSubmitted` (ML scoring in a later phase), with rules from the Configuration Service, claim history from the read replica and its own Fraud DB; publishes `FraudFlagged`. |
| **Reporting Service** | Role-based reports from Redshift as scheduled or on-demand jobs, delivered as a link (report catalogue in §6, Workflow 4); the Auditor's read-only extract of the application audit trail. |

**Support services**

| Service | Responsibility |
|---|---|
| **Payment Service** (PCI-DSS) | Electronic payments through a PCI-DSS Level 1 provider (Stripe): collects the customer's dues on Stripe's hosted payment page and pays workshops and customers through Stripe Connect payouts. Owns the Payment DB (see *Payments and payouts* below). |
| **User / RBAC Service** | Accounts, the six roles and their permissions — **configurable without code changes** — staff availability, and contact details and notification preferences, in the User DB. Passes customer profile changes (correspondence address, billing cycle) to E3, which owns them. |
| **Document Service** | Upload checks, metadata and versioning (S3 for content, the Document DB for metadata, OpenSearch for search); see *Document upload, validation and claim linkage* below. |
| **Location Service** | Partner directory — workshops, authorised service stations and car-rental partners — and surveyor coverage areas in the Partner DB; lookup by zip code or geolocation through OpenSearch geo-search, with Amazon Location Service turning addresses and zip codes into coordinates. |
| **Configuration Service** | Feature flags, workflow transitions, role permissions, fraud rules and SLA thresholds in the Config DB, cached in Redis; changed from the administration console without redeployment. |

### Layer 4 — Async / Messaging

- **Transactional outbox and outbox relay** — a service writes each domain event to an outbox table in the same transaction as the change that raised it, and an outbox relay publishes it to EventBridge. An event therefore exists exactly when its change committed, and none is lost if the bus is briefly unreachable. The POC's notification outbox follows the same pattern.
- **AWS EventBridge** — one custom event bus per Region carrying the domain events below. Its archive is enabled, so events can be replayed to a new consumer or after a failover, and its rules start and advance the Step Functions claim workflow.
- **AWS SQS** — one queue per consuming service, each with a **dead-letter queue** and alarms on the first dead-lettered message and on the age of the oldest message. Consumers are idempotent: they deduplicate on the event ID and drop an event older than the claim version they already hold.
- **AWS SNS** — the last-mile hop for SMS and for mobile push to APNs and FCM; it also returns SES bounce and delivery reports to the Notification Service.
- **Amazon EventBridge Scheduler + AWS Lambda** — scheduled jobs: the SLA and ageing scan, the nightly document reconciliation and the clean-up of superseded workflow executions. Lambda also runs the document indexing consumer.

This asynchronous backbone is what turns a status change into an instantaneous notification and an analytics record, without coupling services to one another.

**Event catalogue.** This table is the single list of domain events; every page of Appendix B uses these names. Each event carries a common envelope — event ID, claim ID, claim version, time of occurrence, schema version and correlation ID (Messaging, Analytics and Identity DAR).

| Event | Published by | Consumed by |
|---|---|---|
| `ClaimCreated` | Claims Service | Workflow Engine, Incident Management, Fraud Detection, Notification |
| `ClaimAssigned` | Incident Management | Claims Service, Notification |
| `StatusChanged` | Claims Service | Notification (every status change) |
| `SurveySubmitted` | Workflow Engine | Notification (the Adjustor) |
| `ClaimApproved` · `ClaimRejected` | Workflow Engine | Payment Service, Notification; the workshop is told to proceed |
| `FraudFlagged` | Fraud Detection | Claims Service (Fraud Review hold), Notification (the Case Manager) |
| `DocumentUploaded` | Document Service | Claims Service, Fraud Detection, indexing consumer |
| `AppointmentBooked` · `RentalBooked` | Booking Service | Notification (the workshop receives the initial accident details) |
| `WorkOrderUploaded` · `RepairStatusUpdated` · `DeliveryDateChanged` | Repair & Work Order Service | Claims Service, Notification |
| `InvoiceSubmitted` | Repair & Work Order Service | Payment Service, Fraud Detection, Claims Service, Notification |
| `PaymentApproved` · `PaymentReceived` · `PayoutSent` | Payment Service | Claims Service, Notification |
| `SlaBreached` | SLA and ageing scan (scheduled) | Notification |
| `ReportReady` | Reporting Service | Notification |

### Layer 5 — Data (Polyglot, Multi-AZ)

A **polyglot persistence** strategy uses the right store for each job:

| Store | Technology | Purpose |
|---|---|---|
| **Claims DB** | RDS PostgreSQL (Multi-AZ) | Primary transactional store: claims, status history, assignments, policy snapshot, fraud hold and the owning workflow execution. |
| **User DB** | RDS PostgreSQL (Multi-AZ) | Accounts, roles and permissions, staff availability, contact details and notification preferences. |
| **Document DB** | RDS PostgreSQL (Multi-AZ) | Document metadata, versions, SHA-256 digests and retention class, each row linked to its claim; JSONB columns for flexible, evolving attributes. |
| **Payment DB** | RDS PostgreSQL (Multi-AZ) | Customer dues, amounts owed to workshops and customers, Stripe payment intents, connected accounts and payouts. |
| **Repair DB** | RDS PostgreSQL (Multi-AZ) | Work orders, estimates, repair status, delivery dates and invoices. |
| **Booking DB** | RDS PostgreSQL (Multi-AZ) | Workshop appointments and rental bookings. |
| **Partner DB** | RDS PostgreSQL (Multi-AZ) | Partner directory and surveyor coverage areas. |
| **Config DB** | RDS PostgreSQL (Multi-AZ) | Feature flags, workflow transitions, role permissions, fraud rules and SLA thresholds. |
| **Notification DB** | RDS PostgreSQL (Multi-AZ) | The delivery record of every message sent. |
| **Fraud DB** | RDS PostgreSQL (Multi-AZ) | Fraud scores, rule hits, review outcomes and the document-digest index. |
| **Audit DB** | RDS PostgreSQL (Multi-AZ, separate instance) | The append-only, hash-chained application audit trail (Layer 6). |
| **Cache** | ElastiCache Redis | Session, claim-status, permission and reference-data caching for sub-100 ms reads. |
| **Search** | OpenSearch | Full-text document search and workshop geo-search. |
| **Object Storage** | Amazon S3 | Six buckets: incoming uploads, claim documents, communications, audit archive, reports, and the portals' static files — versioned and KMS-encrypted, with Object Lock on claim documents, communications and the audit archive. |
| **Data Warehouse** | Amazon Redshift (RA3) | Analytics, management reporting and fraud analytics, fed by a zero-ETL integration from RDS PostgreSQL. |

In Phase 1 the ten service databases run as separate databases, each with its own credentials, on one Multi-AZ RDS PostgreSQL instance per Region. Every connection goes through **RDS Proxy**, which keeps the connection count bounded as tasks scale out, and an **in-Region read replica** serves status reads, assignment workload, fraud history and the SLA scan. The audit store runs on its own instance, so no one with access to the service databases can alter it. Redshift receives changes within seconds through a **zero-ETL integration**, filtered to the tables reporting needs — claims, status history, assignments, payments, fraud flags, repairs and bookings — and excluding credentials and document content (Messaging, Analytics and Identity DAR).

Document metadata deliberately stays in PostgreSQL rather than in a separate document database. JSONB covers the flexible attributes and OpenSearch handles full-text search, so a third-party document store would add a vendor, an internet-egress path and its own multi-Region cluster without adding a capability.

### Layer 6 — Infrastructure / Platform (Cross-Cutting)

These platform services govern **every layer above** and provide the non-functional backbone:

- **IAM + SSO (Okta)** — centralised identity and single sign-on.
- **Secrets Manager + KMS + ACM** — secret rotation, AES-256 encryption at rest, asymmetric token-signing and audit-digest keys, and TLS certificates.
- **CloudWatch + X-Ray + Synthetics** — structured JSON logs, distributed tracing for debugging any error condition, and synthetic canaries that run the first-notice-of-loss, status-check and approval journeys every minute and during each release.
- **CloudTrail** — an immutable log of AWS control-plane and data-access API calls (infrastructure audit), run as an organization trail into the log-archive account.
- **Application audit trail** — every business action (registration and sign-in, submission, assignment, assessment, approval, override, fraud decision, payment, document download, configuration change) is written to an **append-only PostgreSQL store on its own RDS instance** (the Audit DB). Services write through an insert-only role; no role can update or delete a record. Each record carries the actor, timestamp, source IP, request ID and the previous record's hash. Every hour a digest of the chain, signed with an asymmetric KMS key, is written to the audit-archive bucket under S3 Object Lock in compliance mode, with a daily export of the records, so the chain can be verified independently of the database. Every claim document's SHA-256 digest is recorded at upload. The Auditor reads the trail through the Reporting Service. This, not CloudTrail, provides business-level non-repudiation. Amazon QLDB is not used, because AWS has ended support for it; on-premise the same design runs on PostgreSQL with MinIO object locking.
- **Security services** — Amazon GuardDuty (including Malware Protection for S3, which scans every upload), AWS Security Hub, Amazon Inspector (container-image and Lambda scanning) and Amazon Macie (personal data in S3), with findings collected in the security account.
- **AWS Backup** — automated backups and point-in-time recovery for RDS under one backup policy, with copies to us-east-2.
- **CodePipeline + CodeBuild + CodeDeploy + Amazon ECR** — CI/CD with security scans, a staging environment and blue-green deployment for zero-downtime releases; container images stored in **Amazon ECR**.
- **Terraform** — Infrastructure-as-Code for every environment. Terraform versions the infrastructure; it does not make AWS-managed services run on-premise. On-premise portability comes from the container images and the on-premise profile (see *Deployment Options* below).
- **ECS Fargate** — serverless container orchestration with no EC2 fleet to manage.
- **AWS accounts** — AWS Organizations keeps development, staging, production (both Regions) and a security and log-archive account apart.

### Key Design Details

#### Document upload, validation and claim linkage

Every document is tied to its claim from the moment an upload is requested, and nothing reaches the claim until it has been checked (Document Management DAR):

1. **Access check.** The Document Service asks the Claims Service whether the user may add a document to that claim, passing the user's token on; the answer is cached in Redis for a few seconds. Only then does it issue a **pre-signed POST** that expires in five minutes.
2. **Upload policy.** The policy fixes the object key `incoming/{claimId}/{documentId}`, the allowed content types and a size range, and requires a **SHA-256 checksum**, so S3 itself rejects a file that differs from the digest the client declared.
3. **Malware scan.** Amazon GuardDuty Malware Protection for S3 scans each new object. A clean file is moved to `claims/{claimId}/{documentId}/v{n}` in the claim-documents bucket and tagged with its claim and document IDs; an infected file is quarantined and the uploader told.
4. **Metadata and event.** On a clean scan the Document Service writes the Document DB row — claim ID, type, uploader, size, version, SHA-256 digest and retention class — and publishes `DocumentUploaded` with the claim ID and digest. The **Claims Service consumes it and attaches the document to the claim's record and timeline**, and the Fraud Detection Service checks the digest against other claims.
5. **Indexing.** An indexing consumer extracts text (Apache Tika for born-digital PDFs, Amazon Textract for scans and photos), checks the file's actual type against the declared one, and writes the metadata and text to OpenSearch. The index is derived data and can be rebuilt from PostgreSQL and S3.
6. **Clean-up and reconciliation.** A lifecycle rule deletes any incoming object not confirmed within 24 hours, and a nightly scheduled job compares the Document DB with S3 Inventory to flag a file without metadata or metadata without a file.
7. **Downloads.** A permitted download is a pre-signed GET that expires within minutes; who asked for which document, and when, goes to the application audit trail.

#### Payments and payouts

- **Customer dues.** When a workshop submits the final invoice (`InvoiceSubmitted`), the Payment Service works out what the customer owes — the invoice less the approved amount, at least the deductible — and the customer is told before paying. The customer pays on **Stripe's hosted payment page** from the portal or the app, so card data never reaches eClaims (Assumption 4).
- **Payouts.** On `ClaimApproved` the Payment Service records what YCompany owes. Once the invoice is in, it pays the workshop through a **Stripe Connect payout**; for a repair at an external workshop it reimburses the customer the same way. Workshops and customers complete Stripe's Connect onboarding before their first payout, and Stripe holds their bank details (Assumption 14).
- **Webhooks.** Stripe reports every payment and payout to `/payments/webhooks`. The Payment Service verifies each webhook's signature and processes each Stripe event once, keyed on its event ID.
- **Events and status.** `PaymentApproved` (a payout authorised), `PaymentReceived` (the customer's dues collected) and `PayoutSent` (a payout confirmed by Stripe) move the claim to Paid once everything is settled, then to Closed. Workshops track their payments in the Partner Portal; customers in the portal or the app. The Payment DB holds dues, amounts owed, payment intents, connected accounts and payouts.

#### Fraud handling

- The Fraud Detection Service scores a claim on `ClaimCreated`, `DocumentUploaded` and `InvoiceSubmitted`, with rules held in the Configuration Service — for example a claim soon after the policy started, repeated claims on one vehicle or policy (claim history from the read replica), a photo whose SHA-256 digest already belongs to another claim (the digest index in the Fraud DB), or an invoice well above the approved estimate.
- A score above the configured threshold publishes `FraudFlagged`. The Claims Service puts the claim on a **Fraud Review** hold, which blocks further transitions and payments, and the Case Manager is notified. The Case Manager clears the flag, and the claim resumes where it stopped, or confirms it, and the claim is Rejected and referred for investigation outside eClaims.
- Scores, rule hits and outcomes reach Redshift through the zero-ETL integration for the fraud report. ML scoring is a later phase (§10).

#### Communications archive

Every message the Notification Service sends — channel, recipient, time and the rendered content — is stored as an object in the **communications bucket** under S3 Object Lock in compliance mode, with its delivery record in the Notification DB; SES and SNS delivery reports update the record. Staff and the Auditor see a claim's communications on the claim in the Internal Portal.

#### Claim SLA and ageing alerts

The case study asks the alert and notification sub-system to analyse the time to resolve each incident. An **EventBridge Scheduler** job runs every 15 minutes: it reads open claims from the read replica, compares each claim's time in its current status with the thresholds in the Configuration Service, and publishes `SlaBreached`. The Notification Service alerts the assignee and the Case Manager, and a second breach escalates to the Regional Manager. The same ageing figures feed the ageing matrix (§6, Workflow 4).

### Deployment Topology

The diagram's fifth page, **Cloud / Deployment Architecture** (`eclaims-cloud`), translates the six
logical layers above into a physical AWS network topology for **Phase 1: two AWS Regions, each
Multi-AZ**. **us-east-1** (N. Virginia) is the primary Region and serves all traffic; **us-east-2**
(Ohio) is a warm standby that runs the same stack at minimum capacity. Multi-Region active-active
remains out of scope (§10). Inbound traffic — from browsers, the mobile app and Stripe's webhooks —
resolves through **Amazon Route 53** (**G1**) and passes through a global edge tier outside any
Region — **G2** AWS WAF + Shield and **G3** CloudFront. CloudFront serves the three portals' static
files from an S3 bucket through origin access control, and sends API calls to its origin hostname, a
Route 53 failover record whose health checks follow **Route 53 ARC routing controls** (**G4**), so
traffic reaches us-east-2 only when the failover runbook switches Regions. In us-east-1, one **Amazon
VPC** spans three Availability Zones, us-east-1a, us-east-1b and us-east-1c. A single regional
Application Load Balancer (**V1**) places a node in each zone's public subnet, accepts traffic only
from CloudFront (the CloudFront managed prefix list in its security group, plus a secret origin
header), and reaches the ECS Fargate service tasks (**V3**) in all three zones through one target
group per service. Each zone repeats the same three-subnet pattern: a public subnet holding a NAT
Gateway (**V2**); a private/app subnet running the Fargate tasks — every microservice from Layer 3,
including the Auth Service that Layer 2 groups logically at the edge — and **RDS Proxy** (**V7**);
and an isolated data subnet with no direct route to the internet. The data subnets hold the RDS
PostgreSQL primary and standby with the per-service databases (**V4**), an in-Region read replica
(**V8**), the separate Audit DB (**V9**), ElastiCache Redis (**V5**), a three-node OpenSearch domain
(**V6**) for write quorum, and the Redshift cluster (**V10**), which receives changes from V4 through
the zero-ETL integration. AWS-managed, serverless services from Layers 4–6 — S3, EventBridge, SQS,
SNS, Lambda and Step Functions, EventBridge Scheduler, Secrets Manager, KMS, IAM, CloudWatch, X-Ray,
CloudTrail, GuardDuty, Security Hub with Inspector and Macie, AWS Backup, CloudWatch Synthetics, ACM
and Amazon Location Service (**N1–N18**) — sit outside the VPC's subnets, reached through VPC
endpoints. Browsers and the mobile app upload documents straight to S3 (**N1**) with pre-signed
POSTs, and GuardDuty Malware Protection (**N13**) scans each object before the Document Service
accepts it. Only the NAT Gateways carry egress to the external systems already introduced on page 1
(**D1–D4**, **E1**, and YCompany's Policy Administration System, **E3**); SNS also delivers mobile
push to APNs and FCM (**D5**). Every task with a side effect (assignment, notification, payment, the
outbox relay and the scheduled jobs) first checks the ARC routing-control state (**G4**) and acts only
in the active Region. The page shows the production account; AWS Organizations keeps development,
staging, production and a security and log-archive account apart, with CloudTrail as an organization
trail into the log-archive account. The release workflow that deploys into this runtime is detailed
separately on page 6 (below).

us-east-2 repeats the pattern in compact form: its own VPC across us-east-2a, us-east-2b and
us-east-2c, a regional ALB (**V1′**), NAT Gateways (**V2′**), Fargate tasks held at minimum capacity
(**V3′**) and RDS Proxy (**V7′**). Data reaches it through each service's managed cross-Region
feature: an asynchronous RDS cross-Region read replica (**V4′**) and one of the Audit DB (**V9′**),
OpenSearch cross-cluster replication to a follower domain (**V6′**) over inter-Region VPC peering, S3
Cross-Region Replication including the communications and Object Lock audit archives (**N1′**),
Secrets Manager replica secrets (**N7′**), us-east-2 KMS keys (**N8′**), Redshift snapshot copies from
which the standby warehouse (**V10′**) is restored, and AWS Backup copies (**N15′**). ElastiCache
(**V5′**) is not replicated and starts cold. EventBridge with its archive, SQS, SNS, Lambda, Step
Functions and EventBridge Scheduler (**N2′–N6′**) are deployed by Terraform in both Regions, with the
Scheduler's jobs idle until the Region is active. On a us-east-1 outage the on-call runs a
pre-approved, game-day-tested runbook: promote the database and audit replicas and their secrets,
point RDS Proxy at them, pre-scale the standby services, then flip the routing controls so Route 53
answers with V1′. CloudWatch alarms page the on-call but never move traffic, and a recovered us-east-1
cannot take traffic back while its control is off, which prevents split-brain. Failback is the same
runbook in reverse, after re-seeding us-east-1. us-east-2 also holds SES production access, SNS SMS
and mobile-push registration, partner and Stripe allow-lists for its NAT addresses and raised Fargate
quotas, so it can take full load. Messages queued and workflow steps running in us-east-1 at the
moment of failure are not replicated; the runbook re-drives the affected claims from their status in
the database and from the transactional outbox. Step Functions executions are regional and are not
replicated either, so the runbook does not recreate the roughly one million open claim executions
(§9.1) up front. Instead, each claim records the execution that owns it. When the next action on a
claim finds that execution in the other Region, the Workflow Engine starts a new execution in the
active Region at the claim's current status, with the action in its input, so the action completes in
the same request. Workflow executions carry no timers in Phase 1 — claim ageing is checked by the
scheduled SLA job against the database (*Claim SLA and ageing alerts*, above) — so a claim that nobody
acts on needs no execution until somebody does. Because every task with a side effect checks the ARC
routing-control state first, a recovering us-east-1 cannot resume a stranded step and repeat it.
Failback applies the same rule in the other direction, and a scheduled job then stops the executions
that a rebuild has superseded. The Region-failure targets are in §7.

![Cloud / Deployment Architecture](diagrams/Cloud%20_%20Deployment%20Architecture.jpg)

*Figure — Cloud / Deployment Architecture: the Phase 1 two-Region topology, us-east-1 primary and us-east-2 warm standby, each Multi-AZ (Appendix B, page 5).*

### CI/CD Pipeline

The diagram's sixth page, **CI/CD Pipeline** (`eclaims-cicd`), details the release workflow Layer 6
names only in passing — **AWS CodePipeline + CodeBuild + CodeDeploy + Amazon ECR**, a fully-managed,
pay-per-use toolchain with no idle build server to run or patch, chosen over a self-managed
alternative such as Jenkins. A push or merge to `main` in the **GitHub** repository (**P1**),
connected through AWS CodeConnections, triggers **CodePipeline** (**P2**), which runs five stages in
sequence through a shared **Amazon S3** artifact bucket (**P3**):

1. **Build and scan** — CodeBuild (**P4**) runs the unit tests and the code scans (**Q5**: Semgrep,
   pip-audit, npm audit and gitleaks), builds the container images, the portals' static bundles and
   the mobile app, and pushes the images to **ECR** (**P5**), where Amazon Inspector (**Q4**) scans
   them. A critical finding fails the stage.
2. **Infrastructure** — CodeBuild (**P6**) runs Checkov on the Terraform code, then `terraform plan`,
   and `apply` for each environment's stacks behind a manual approval gate.
3. **Pre-production** (**P14**) — the release goes to the development and then the staging account.
   An Alembic migration runs as a one-off ECS task (**P17**), expand-then-contract so the old and new
   versions both work during the switch; the services deploy blue/green; the portals' files go to S3
   with a CloudFront invalidation; and the staging gates run (**P15**): integration tests, a short
   **k6** load test at the §9.1 design point and an OWASP ZAP scan. The mobile build goes to TestFlight
   and Google Play internal testing (**P19**).
4. **Release approval** (**P16**) — a manual sign-off before production.
5. **Production** — the same migration step, then **CodeDeploy** (**P7**) provisions a Green Fargate
   task set (**P11**) alongside the current Blue set (**P10**) on the same ECS Service (**P9**) shown on
   the Cloud/Deployment page, and shifts ALB traffic (**P8**) gradually while **CloudWatch Synthetics**
   canaries (**P18**) and smoke tests exercise the main journeys. A CloudWatch (**R1**) alarm on health
   or a failed canary rolls back automatically — the mechanism behind the zero-downtime NFR in §7.

ECR replicates every image to us-east-2 (**P12**), Terraform applies both Regions' stacks, and once
the us-east-1 deploy succeeds a cross-Region CodeDeploy action (**P13**) runs the same blue/green
release into the us-east-2 standby, so both Regions run the same image. Mobile store releases follow
a production release after their own approval.

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
| Scheduled jobs | EventBridge Scheduler · Lambda | Kubernetes CronJobs |
| Push notifications | SNS mobile push | Direct APNs and FCM integration |
| Relational data | RDS PostgreSQL (Multi-AZ) | PostgreSQL with Patroni high availability |
| Connection pooling | RDS Proxy | PgBouncer |
| Change-data capture to analytics | Zero-ETL integration (RDS PostgreSQL → Redshift) | Debezium on Kafka Connect |
| Application audit store | PostgreSQL (append-only) · S3 Object Lock | PostgreSQL (append-only) · MinIO object locking |
| Malware scanning of uploads | GuardDuty Malware Protection for S3 | ClamAV scanning service |
| Geocoding | Amazon Location Service | A self-hosted geocoder (e.g. Nominatim) or a licensed geocoding service |
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
| **Customer** | Customer Portal / Mobile App | Submit claim, upload documents, track status, select workshop, book rental, pay electronically, receive payouts, change correspondence address and billing cycle |
| **Case Manager** | Internal Portal | Assign / delegate cases, override Surveyor and Adjustor decisions, view full case details, clear or confirm fraud flags, receive SLA alerts, generate reports on received claims |
| **Surveyor** | Internal Portal / Mobile App (offline) | Submit field damage assessment, update vehicle status |
| **Adjustor** | Internal Portal | Review claim, documents and survey; adjudicate and approve/reject the amount against policy coverage |
| **Auditor** | Internal Portal | Read-only access to all claims, their processing history and the application audit trail |
| **Regional Manager** | Internal Portal | Region-level reports: processing time, amounts paid, claim count by geography; escalated SLA alerts |
| **Top Management** | Internal Portal | Cross-region dashboard, KPIs and trend analysis |
| **Administrator** | Internal Portal (administration console) | Maintain role permissions, workflow and fraud rules and SLA thresholds; register partners and surveyor coverage areas |
| **Partner Workshop / Authorised Service Station** | Partner Portal | Receive appointments with the initial accident details, upload work order and estimates, update repair status and delivery date, submit final bill, track payment |
| **Car Rental Partner** | Partner Portal | Publish rental-vehicle catalogue, confirm bookings |
| **External Workshop** | None | Repairs a vehicle that the customer takes outside the partner network; its estimate and invoice reach eClaims as documents the customer uploads (Assumption 17) |

Access for every role is enforced by the **User / RBAC Service** and is **configurable without code changes**, satisfying the functional requirement for role behaviour to be reconfigured administratively.

**Role mapping.**
- The case study asks for the *Incident Manager* to be notified at first notice of loss. In eClaims this responsibility sits with the **Case Manager** role (assumption, §10). A separate Incident Manager role can be added through the RBAC service without code changes if YCompany's organisation requires it.
- The **Administrator** is an administrative role, separate from the six claims-processing roles; its changes are written to the application audit trail like any other action.
- The Phase 1 POC implements the Customer role and five internal roles: Case Manager, Surveyor, Adjustor, Auditor and Regional Manager. Top Management is part of the target solution.

![Bounded Contexts (Domain View)](diagrams/Bounded%20Contexts%20(Domain%20View).jpg)

*Figure — Bounded Contexts: the Customer, Internal and Partner domains and the event backbone that integrates them (Appendix B, page 7).*

---

## 6. Key Workflows

The five workflows below trace a claim through its full lifecycle and cover the customer's own account. Each numbered step names the acting party and — where relevant — the event that fires (event catalogue in §4, Layer 4). Notifications are omitted from individual steps for brevity but are raised on **every** status change. Each workflow is colour-coded on the data-flow arrows of the Layered Solution Architecture page (Appendix B, page 4); a hop that several workflows share is drawn in grey with their numbers on its label, so each workflow can be traced visually end to end.

### Workflow 1 — Claim Submission & Assignment

1. Customer logs in on the portal or the mobile app and submits a claim (incident details, photos, police report). Photos and documents go straight to S3 and are validated and malware-scanned before they join the claim (§4, *Document upload, validation and claim linkage*).
2. **Claims Service** checks the policy and its period of cover with the Policy Administration System (E3), generates a Claim ID against the policy and publishes `ClaimCreated`, which also starts the claim's workflow execution.
3. **Incident Management Service** auto-assigns a Case Manager, Surveyor and Adjustor based on location (surveyor field-office coverage), availability and workload (`ClaimAssigned`).
4. **Fraud Detection Service** scores the claim; a flag puts it on a Fraud Review hold for the Case Manager (`FraudFlagged`).
5. **Notification Service** sends SMS, email and push messages to the assigned staff and to the customer (claim received, ID confirmed).

### Workflow 2 — Survey & Adjudication

1. Customer finds a partner workshop or authorised service station by zip code or location (**Location Service**) and books an appointment (**Booking Service**); the workshop receives the initial accident details with the booking (`AppointmentBooked`). The customer may instead take the vehicle to an external workshop.
2. Once the vehicle is dropped off, the customer selects a rental vehicle if the policy covers one; the Booking Service checks the cover with E3 (`RentalBooked`).
3. **Surveyor** assesses the damage and submits the assessment from the Internal Portal or the mobile app, offline if needed; `SurveySubmitted` notifies the **Adjustor**.
4. **Adjustor** reviews the claim, documents and survey, then adjudicates the amount against the policy cover, which the Claims Service re-checks with E3.
5. `ClaimApproved` notifies the customer of the approved amount and the workshop to proceed, and the Payment Service records what YCompany owes; `ClaimRejected` ends the claim.

### Workflow 3 — Repair Tracking & Payment

1. Workshop uploads the work order and estimates and updates the repair status (`WorkOrderUploaded`, `RepairStatusUpdated`; the claim is In Repair) → customer notified.
2. Workshop updates the expected delivery date (`DeliveryDateChanged`) → customer notified of the change.
3. On completion, the workshop submits the final invoice (`InvoiceSubmitted`; the claim is Invoiced). For an external workshop, the customer uploads its invoice.
4. Customer is notified of the amount due before paying, and **pays electronically** on Stripe's hosted payment page from the portal or the app (`PaymentReceived`).
5. **Payment Service** pays the workshop — or, for an external workshop, reimburses the customer — through a Stripe Connect payout (`PaymentApproved`, `PayoutSent`); the claim moves to Paid, then Closed.
6. Workshop tracks payment status in the Partner Portal; the customer in the portal or the app.

### Workflow 4 — Reporting

1. **Case Manager** generates reports on assigned claims (processing time, pending items).
2. **Regional Manager** views a regional dashboard (amounts paid, claim count, geography).
3. **Top Management** views cross-region KPIs and identifies high-claim regions.

**Report catalogue.**

| Report | For | Contents | Scope |
|---|---|---|---|
| Claims received and processed | Case Manager | Claims received, processed and pending; processing time | Claims assigned to that Case Manager |
| Claims processed by role | Claims department (Case Manager and above) | For each Adjustor, Surveyor, Case Manager and Workshop: claims handled, average time in their stage, pending items; for workshops also repair turnaround, invoices and payment status | By role and region |
| Ageing matrix | Case Manager, Regional Manager | Open claims by status and age band (0–7, 8–15, 16–30, 31–60, over 60 days), with SLA breaches; thresholds from the Configuration Service | Own claims or own region |
| Fraud report | Case Manager, Regional Manager, Top Management | Flags by rule, review outcome (cleared or confirmed), amount at stake | By region |
| Regional dashboard | Regional Manager | Processing time, amount paid out, claim count by geography (state, county, zip code) | Own region |
| Cross-region KPIs | Top Management | Claims received, amount paid out and processing time per region; regions with the most claims and the highest payouts; trends | All regions |
| Audit extract | Auditor | A claim's processing history and its application audit-trail records | All claims, read-only |

Every report runs on Redshift, never on the transactional databases. Row-level security limits each user to their region and role, and personal fields are masked for analytics users. Scheduled reports run as Redshift scheduled queries and on-demand reports as background jobs; the result is written to the reports bucket and delivered as a link in a notification (`ReportReady`, §9.2 rule 3). The audit extract reads the Audit DB through a read-only role.

### Workflow 5 — Customer Self-Service

1. Customer changes the correspondence address or the billing cycle in the portal or the app; a change to contact details requires MFA.
2. **User / RBAC Service** passes the change to the Policy Administration System (E3), which owns policy and billing records (Assumption 16), and records the request in the application audit trail.
3. **Notification Service** confirms the change to the customer.

---

## 7. Non-Functional Requirements — Single-Page Pull-Out

> This section is designed as a **stand-alone, single-page summary** for stakeholders who need only the NFR coverage. It maps each requirement from the case study to the concrete architectural implementation that satisfies it.

| NFR | Requirement | Implementation in eClaims |
|---|---|---|
| **Availability** | 24×7 operation; system restarts itself on any crash | Multi-AZ ECS across 3 zones; container health checks every 5 s with automatic restart; RDS Multi-AZ failover in under 60 s; a warm standby in us-east-2 takes over if us-east-1 fails |
| **Scalability** | Handle 200M+ customers and future growth; auto-scale to demand | ECS target-tracking auto-scaling (minimum 2 tasks per service across AZs; maximum sized from the workload model, ceiling 100); read replicas, RDS Proxy and table partitioning; SQS buffering; Redis caching — see §9 |
| **Performance** | 99% of services complete in **< 5,000 ms**, peak and non-peak | Redis L1 cache; CloudFront edge cache; connection pooling; query indexing; slow work kept off the request path (asynchronous integrations, direct-to-S3 uploads, asynchronous reports); continuous P50/P95/P99 latency monitoring; latency budget and load-test gates in §9 |
| **Security** | OWASP Top 10; encryption of sensitive data; RBAC | WAF + Shield with account takeover prevention; ALB reachable only through CloudFront; OAuth2 + JWT with MFA for customers and partners; RBAC at every layer; KMS AES-256 at rest; TLS 1.2+ in transit; every upload malware-scanned; GuardDuty, Security Hub, Inspector and Macie; code, dependency, image and infrastructure scans plus a ZAP scan in the pipeline; PCI-DSS scope limited to Stripe's hosted page; full audit trail |
| **Resilience / Reliability** | Self-healing; no single point of failure | Circuit breakers and exponential-backoff retries; blue-green deployment; RTO < 15 min, RPO < 5 min for an Availability Zone failure; for a Region failure, RTO < 30 min and RPO < 5 min for the database (< 15 min for S3 objects), given a pre-approved, game-day-tested runbook and pre-raised us-east-2 quotas; the Region RTO covers actions on existing claims too: each claim's workflow execution is rebuilt in us-east-2 on its first action after failover, which makes that one action slightly slower (§4, Deployment Topology), and a change made within the RPO window before the failure is lost and has to be re-entered |
| **Observability** | Enough logging to debug any error; SLA monitoring | Structured JSON logs → CloudWatch; X-Ray distributed tracing; CloudWatch Synthetics canaries on the main journeys; CloudTrail audit; dead-letter-queue and queue-age alarms; custom KPI metrics and automated SLA alerts, including claim time-to-resolve alerts |
| **Flexibility / Deployability** | No code changes for role config; on-premise **and** cloud | Configuration & RBAC services for administrative role changes; container images plus an on-premise profile on Kubernetes with a portable equivalent for each managed service (§4, Deployment Options); Terraform for every environment |
| **Compliance / Non-Repudiation** | Audit trail; no repudiation; guard against fraud | Append-only, hash-chained audit store on its own database, with KMS-signed hourly digests in S3 Object Lock (WORM, compliance mode); SHA-256 digest of every claim document, checked by S3 at upload; CloudTrail for infrastructure audit; rule-based (then ML) fraud detection with a Fraud Review hold; every communication archived under Object Lock |
| **Data management** | Store, back up and recover in a distributed environment | Multi-AZ RDS with automated backups and point-in-time recovery under AWS Backup, copied to us-east-2; RDS and Audit DB cross-Region read replicas and OpenSearch cross-cluster replication to us-east-2; S3 Cross-Region Replication; versioned object storage; reporting warehouse fed by zero-ETL and restored from cross-Region snapshot copies |
| **Maintainability** | Testability, configurability, upgradeability | Independently deployable services; automated test suites, security scans and k6 and ZAP gates in staging; blue-green upgrades with expand-then-contract migrations; feature flags |

---

## 8. Technology Stack

| Component | Technology | Justification |
|---|---|---|
| Backend API | Python **FastAPI** | Async, high performance, automatic OpenAPI generation, strong typing via Pydantic |
| Data access | **SQLAlchemy 2.0 (async)** with **Alembic** migrations | Typed async ORM over PostgreSQL; versioned, reviewable schema migrations per service (the POC seeds its schema from SQL scripts) |
| Frontend | **React 18 + TypeScript + Vite** | Component reuse across the three portals, strong ecosystem, type safety |
| Mobile app | **React Native** (iOS and Android) | One codebase for both platforms, sharing TypeScript, React skills and API clients with the portals |
| Primary database | **PostgreSQL 15** (RDS Multi-AZ) | ACID guarantees for relational claims data; JSONB columns for flexible document metadata; mature, AWS-managed |
| Cache | **Redis 7** (ElastiCache) | Sub-millisecond session and claim-status caching |
| Search | **OpenSearch** | Full-text document search and geo-search for workshops |
| Object storage | **Amazon S3** | Virtually unlimited scale, 11-nines durability, native encryption |
| Messaging | **EventBridge + SQS + SNS**, with a transactional outbox | Cloud-native event bus, reliable queuing with dead-letter queues, fan-out; events published exactly when their change commits |
| Scheduled jobs | **Amazon EventBridge Scheduler + AWS Lambda** | Serverless timers for the SLA scan, document reconciliation and execution clean-up |
| Workflow | **AWS Step Functions** | Managed state machine with a built-in audit trail and no infrastructure to run |
| Notifications | **AWS SES** (email) + **SNS** (SMS and mobile push to APNs and FCM) | AWS-native, pay-per-use, compliant delivery; no separate push vendor |
| Payments | **Stripe** (PCI-DSS Level 1), including **Stripe Connect** payouts | Industry-standard, with built-in fraud detection; keeps YCompany out of PCI scope; Connect pays workshops and customers without eClaims holding bank details |
| Connection pooling | **RDS Proxy** | Keeps database connections bounded as tasks scale out, and shortens failover |
| Analytics feed | **Zero-ETL integration** (RDS PostgreSQL → Redshift) | Changes arrive within seconds with no pipeline to build or run (Messaging, Analytics and Identity DAR) |
| Audit store | **PostgreSQL (append-only)** + **S3 Object Lock** | Hash-chained records with KMS-signed digests under WORM retention; portable to PostgreSQL with MinIO on-premise |
| Malware scanning | **Amazon GuardDuty Malware Protection for S3** | Scans every upload before it joins a claim (Document Management DAR) |
| Text extraction | **Apache Tika** + **Amazon Textract** | Text from born-digital PDFs and from scans and photographs, for full-text search |
| Geocoding | **Amazon Location Service** | Turns zip codes and addresses into coordinates for workshop and coverage lookups |
| Container orchestration | **AWS ECS Fargate** | Serverless containers, no EC2 fleet to manage |
| Infrastructure-as-Code | **Terraform** | Version-controlled infrastructure for every environment; providers exist for AWS and for on-premise platforms (Kubernetes, vSphere) |
| CI/CD | **AWS CodePipeline + CodeBuild + CodeDeploy + Amazon ECR**, from **GitHub** through AWS CodeConnections | AWS-native pipeline with blue-green support |
| Security scanning | **Semgrep**, **pip-audit**, **npm audit**, **gitleaks**, **Checkov**, **Amazon Inspector**, **OWASP ZAP** | Code, dependency, secret, infrastructure, container-image and running-application checks in the pipeline |
| Load testing | **k6** | Scripted load tests in staging, versioned with the code |
| Observability | **CloudWatch + X-Ray + CloudTrail** | Native AWS integration with minimal operational overhead |
| Synthetic monitoring | **CloudWatch Synthetics** | Canaries for the main journeys every minute and during each release |
| Security | **AWS WAF + Shield + KMS + IAM + GuardDuty + Security Hub + Macie** | Layered, defence-in-depth security across the stack |
| Backup | **AWS Backup** | One backup policy with cross-Region copies |
| Data warehouse | **Amazon Redshift** (RA3) | Petabyte-scale analytics for management reporting |
| Identity / SSO | **Okta** (via IAM) | Centralised enterprise identity and single sign-on |

### POC coverage

The accompanying proof of concept (POC) is a *minimal working* slice of this architecture, running locally
under Docker Compose (see `README.md`). It demonstrates the layered services, role-based access and the
governed claim lifecycle. The table maps each target component to its POC stand-in.

| Target component (production) | POC stand-in |
|---|---|
| Edge — CloudFront, WAF, ALB | nginx reverse proxy per portal, with security headers |
| Auth Service (OAuth2/JWT, Okta SSO) | `auth-service` (FastAPI): JWT access and refresh tokens, bcrypt password hashing, rate-limited login |
| Claims Service + Workflow Engine (Step Functions) | `claims-service` (FastAPI) with an in-service, role-gated state machine from Submitted to Paid — the baseline option evaluated in the Orchestration DAR; the In Repair, Invoiced, Closed, Fraud Review, Withdrawn and Reopened states are target design |
| Policy Administration System (external, E3) | A `policies` table: registration and claim submission are checked against the insured's policy, its period of cover, limit and deductible |
| User/RBAC + Configuration Service | Workflow transitions and role permissions held in two database tables, changeable without a redeploy, with the in-code rules as the fallback; changed in SQL, with no administration screen or feature flags |
| Notification Service (SNS/SES) | Transactional outbox: each status change writes its email and SMS events in the same transaction, and a dispatcher delivers them at least once — email to a local Mailpit inbox, SMS to the log |
| Document Service (S3 + OpenSearch) | Uploads checked for extension, size and actual content type, stored on a local volume under the claim's ID, with their metadata in PostgreSQL linked to the claim; no malware scanning or search |
| Cache (ElastiCache Redis) | Redis |
| Claims DB, User DB and Document DB (RDS PostgreSQL) | One PostgreSQL instance shared by both services (POC simplification) |
| Reporting Service + Redshift | `GET /reports/summary` in `claims-service`, aggregated in SQL and shown on the Internal Portal's Reports page |
| Observability (CloudWatch, X-Ray) | Structured JSON logs with request-ID correlation across services |
| ECS Fargate, CI/CD, Terraform | Docker Compose |

These components are **not in the POC**; the architecture and the estimate cover them:
- Partner Portal
- Payment Service
- Incident Management auto-assignment
- Fraud Detection
- Location Service
- Repair & Work Order Service
- Booking Service

Also not in the POC: the mobile app, which is in Phase 1 but not yet in the estimate (§10, Assumption 13).

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
2. **Uploads bypass the API.** Browsers and the mobile app upload photos and PDFs directly to S3 with pre-signed POSTs; the API only checks access and issues the upload policy. Malware scanning, metadata and indexing run asynchronously after the upload (§4, *Document upload, validation and claim linkage*), so a 10 MB photo on a slow mobile link never counts against API latency.
3. **Reports are asynchronous.** Management reports are generated from Redshift as jobs and delivered as a link or notification. They never query the transactional database in the request path.
4. **Every outbound call is bounded.** Each has a timeout of at most 2 s, one retry with jitter, and a circuit breaker.
5. **Lists are paginated.** At most 100 items per page, served from indexed queries or read replicas.
6. **Hot reads are cached.** Claim status and reference data (policy snapshot, partner directory) sit in Redis with short TTLs and event-driven invalidation.

### 9.3 Scaling strategy by tier

| Tier | How it scales | Trigger and limits |
|---|---|---|
| Edge | CloudFront caches the portals' static assets globally; WAF rate-based rules shed abusive traffic | Managed by AWS |
| Microservices (ECS Fargate) | Stateless tasks behind the ALB with target-tracking auto-scaling | CPU at 60% or ALB requests per target. Minimum 2 tasks per service across AZs; maximum per service from §9.4 (ceiling 100). Cool-downs: 60 s scale-out, 300 s scale-in. Scheduled pre-scaling for known peaks; a catastrophe runbook for manual pre-scaling |
| Asynchronous processing (SQS consumers, Lambda) | Scales on queue depth; SQS absorbs bursts so API latency is unaffected; the outbox relay scales with the services that write events | Age of oldest message > 60 s; a dead-letter queue per consumer for poison messages |
| Scheduled jobs (EventBridge Scheduler, Lambda) | Serverless; the SLA scan and reconciliation read the read replica, never the primary | Job duration and failures alarmed |
| Workflow orchestration (Step Functions) | One Standard execution per open claim; short-lived sub-flows as Express Workflows | Open-execution quota raised to about 3 million per Region in both Regions, against ≈1.0 million open claims (§9.1), a catastrophe week and superseded executions awaiting clean-up; us-east-2 StartExecution, task-callback and state-transition rates raised to us-east-1's before go-live; throttling alarmed in CloudWatch |
| Cache (ElastiCache Redis) | Cluster mode with replicas | Memory > 70% or CPU > 60% |
| Transactional database (RDS PostgreSQL, Multi-AZ) | Vertical scaling for writes; read replicas for queues and status reads; RDS Proxy pools connections as tasks scale out; monthly partitions for status history, communications and document metadata; claims partitioned by creation month beyond 100 million rows | Replica lag < 1 s; CPU < 70% |
| Search (OpenSearch) | Add data nodes; index lifecycle management | JVM memory pressure, storage |
| Object storage (S3) | Unlimited. Lifecycle tiering: Standard → Standard-IA after 90 days → Glacier Deep Archive one year after claim closure. Object Lock for retention | — |
| Analytics (Redshift) | Zero-ETL integration from the transactional store (a CQRS read model); concurrency scaling for month-end reporting | Queue wait time; integration lag |
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

- **Load tests** use k6 in the production-like staging account, which the pipeline's pre-production stage deploys (§4, CI/CD Pipeline), with per-endpoint p50/p95/p99 reported for three profiles:
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
  - CloudWatch Synthetics canaries for first notice of loss, status check and approval, run every minute and during each production traffic shift.
- **In the pipeline:** a short k6 run and an OWASP ZAP scan on every release candidate in staging; the full suite before major releases and before known peak seasons.
- **Capacity reviews:**
  - each quarter, against actual claim volumes;
  - a catastrophe runbook: pre-scale services, raise SMS and email quotas, route status reads to replicas.

The POC runs the same synchronous design at small scale under Docker Compose and is not performance-tested.
Load testing is part of the Testing phase in the estimate.

---

## 10. Assumptions & Scope

### In scope

- Customer Portal (web, React)
- Internal Portal (web, React) — all six roles, plus the administration console
- Partner Portal (web, React) — partner workshops, authorised service stations and car-rental partners
- Mobile App (iOS/Android, React Native) for customers and surveyors — in Phase 1, but not yet in the estimate (Assumption 13)
- Claims lifecycle: Submission → Survey → Adjudication → Approval → Repair → Invoice → Payment → Closure, with Fraud Review, Withdrawn and Reopened
- Customer self-service: correspondence-address and billing-cycle changes, passed to the Policy Administration System
- Document management and archival, with upload validation and malware scanning
- SMS, email and push notifications on every status change; claim SLA and ageing alerts
- Role-based reporting (report catalogue, §6 Workflow 4)
- Electronic payment and payouts (Stripe, including Stripe Connect)
- AWS cloud deployment; on-premise deployment profile designed (§4, Deployment Options)
- Multi-Region warm standby: us-east-1 primary, us-east-2 standby (§4, Deployment Topology)

### Out of scope (Phase 1)

- Multi-Region active-active deployment — Phase 1 runs us-east-2 as a warm standby that takes traffic only after failover
- ML-based fraud detection — a rule-based engine ships in Phase 1; the ML model is a Phase 2 item
- Multi-language support — English only, per the requirements
- Car-rental integration API — the UI is present; the third-party integration is deferred
- Legacy-system migration and historical data backfill

### Assumptions

1. YCompany will adopt **AWS** as its cloud provider.
2. Customer identity is verified via the existing **policy number** at registration.
3. Partner workshops are **pre-registered** in the system by the Administrator.
4. Payment is via **Stripe**; PCI-DSS scope is limited to Stripe's hosted payment page.
5. SMS notifications are delivered via **AWS SNS** (US numbers only for Phase 1).
6. Surveyor geo-coverage areas are **pre-configured** in the Location Service by the Administrator.
7. The delivery team has an AWS account with the necessary permissions.
8. Where the case study is silent, reasonable industry-standard assumptions have been made, as permitted by the assignment guidelines.
9. The *Incident Manager* named in the case study is fulfilled by the **Case Manager** role; a dedicated role can be configured if required.
10. Phase 1 is delivered on AWS. The on-premise profile (§4, Deployment Options) is designed but implemented only if YCompany mandates on-premise hosting; that implementation is not part of the Phase 1 estimate.
11. The workload figures in §9.1 are planning assumptions (6% annual claim frequency, ≈30-day claim lifecycle), to be validated against YCompany's claims data.
12. YCompany has confirmed its **Policy Administration System** (E3) as the source of policy, coverage and policyholder records. Registration (Assumption 2), claim submission, adjudication and rental eligibility are checked against it.
13. The **mobile app** is in Phase 1 scope, but its effort is not yet in the estimate; it is added in the next estimate revision.
14. Workshops and customers who receive payouts complete **Stripe Connect** onboarding (identity and bank details) before their first payout; Stripe, not eClaims, holds their bank details.
15. YCompany sets the **retention period** for each document class before go-live, under the insurance regulations that apply to it (Document Management DAR).
16. The Policy Administration System (E3) accepts **correspondence-address and billing-cycle changes** through an API; eClaims passes each change on and keeps no copy of the policy record beyond the snapshot taken at first notice of loss.
17. **External (non-partner) workshops** have no eClaims access; their estimates and invoices reach eClaims as documents the customer uploads, and the customer is reimbursed.

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
| 10 | DAR — Compute Platform and Container Orchestrator (including Amazon ECS vs Amazon EKS) | `docs/dar/Utsav_eClaims_DAR_Compute.docx` |
| 11 | DAR — Messaging, Analytics and Identity | `docs/dar/Utsav_eClaims_DAR_Messaging_Analytics_Identity.docx` |
| 12 | DAR — Document Management | `docs/dar/Utsav_eClaims_DAR_Document_Management.docx` |
| 13 | Effort estimate, schedule and resource plan | `docs/estimation/Utsav_eClaims_Estimates.xlsm` |

### Appendix A — Requirements Traceability Matrix

The matrix confirms that every capability called for in the case study is addressed by a named component of the solution.

| Case-study requirement | Addressed by |
|---|---|
| Customer portal and mobile app | Customer Portal · Mobile App (Phase 1) |
| Customer login via policy details | Auth Service (registration checked against the Policy Administration System, E3) · User/RBAC Service |
| Change the correspondence address | Customer Portal / Mobile App · User/RBAC Service · Policy Administration System (E3) |
| Change the billing cycle | Customer Portal / Mobile App · User/RBAC Service · Policy Administration System (E3) |
| Submit claim with photos / police report | Customer Portal / Mobile App · Claims Service · Document Service (S3, validated and malware-scanned) |
| Generate Claim ID on first notice of loss | Claims Service (policy checked with E3; `ClaimCreated`) |
| Notify Incident Manager, Adjustor, Surveyor | Incident Management Service (`ClaimAssigned`) · Notification Service |
| Constant status updates to customer | Notification Service (SMS, email, push) · EventBridge (status events) |
| Partner-workshop list & appointment by location/zip | Location Service (OpenSearch, Amazon Location Service) · Booking Service · Customer Portal / Mobile App |
| Choose a partner workshop or any external workshop | Booking Service · Repair & Work Order Service (external-workshop invoice uploaded by the customer) |
| Partner workshop intimated of the initial accident details | Booking Service (`AppointmentBooked`) · Notification Service · Partner Portal |
| Rental-vehicle selection by policy coverage | Booking Service (cover checked with E3) · Customer Portal / Mobile App (car-rental API deferred) |
| Surveyor submits assessment online, via website or app | Internal Portal · Mobile App (offline capture) · Claims Service · Workflow Engine |
| Adjustor adjudicates against policy coverage | Claims Service (cover re-checked with E3) · Workflow Engine |
| Case Manager delegate / override | Incident Management Service · Claims Service (override) |
| Auditor read-only visibility | RBAC (read-only role) · Reporting Service (audit extract) |
| Workshop uploads work order & estimates | Partner Portal · Repair & Work Order Service · Document Service |
| Repair-status & delivery-date updates to customer | Repair & Work Order Service · Notification Service |
| Customer notified of the final bill and pays electronically | Repair & Work Order Service (`InvoiceSubmitted`) · Payment Service (Stripe hosted payment page) |
| Electronic payment to workshops and customers (no cheques) | Payment Service (Stripe Connect payouts) |
| Workshop tracks payment status | Payment Service · Partner Portal |
| Alert sub-system analysing the time to resolve | EventBridge Scheduler SLA scan (`SlaBreached`) · Notification Service |
| Role-based reports (processing time, ageing, fraud) | Reporting Service · Redshift (zero-ETL) · report catalogue (§6, Workflow 4) |
| Claims-processed reports by role (Adjustor, Surveyor, Case Manager, Workshop) | Reporting Service · report catalogue (§6, Workflow 4) |
| Regional & top-management reporting | Reporting Service · Redshift (row-level security by region) |
| Central document management for audit/compliance | Document Service (S3 with versioning and Object Lock + OpenSearch) · application audit trail |
| Alerts/notifications on every status change (SMS/email) | Notification Service (SNS + SES + push) |
| Archive all customer communication | Notification Service · communications bucket (S3 Object Lock) · Notification DB |
| Well-defined data and interface standards | OpenAPI from FastAPI · event catalogue with a common envelope (§4, Layer 4) |
| Identity management with role-based authN/authZ | Okta / IAM · Auth Service · RBAC Service |
| Role actions configurable without code changes | Configuration Service (administration console) · RBAC Service |
| Store, back up and recover data in a distributed environment | Multi-AZ RDS · AWS Backup · cross-Region replicas (§4, Deployment Topology) |
| Encryption of sensitive data at rest | KMS (AES-256) · encrypted RDS/S3 |
| No repudiation & fraud handling | Append-only audit store with KMS-signed digests · document SHA-256 digests · S3 Object Lock · Fraud Detection Service (Fraud Review hold) |
| 24×7 with self-restart | Multi-AZ ECS · health checks · auto-restart |
| On-premise **and** cloud deployment | Container images · on-premise profile on Kubernetes (§4, Deployment Options) · Terraform |
| 99% of requests < 5,000 ms | Workload model, latency budget and load-test gates (§9) · caching · asynchronous processing |
| OWASP Top 10 protection | WAF + Shield · secure SDLC with security scans in the pipeline (§4, CI/CD Pipeline) |

### Appendix B — Architecture Diagram

The full architecture is provided as an editable draw.io / diagrams.net source file at
`docs/sad/architecture-diagram.drawio.xml`. It contains seven pages, reading top-down from business
context to implementation detail:

1. **System Context** — eClaims drawn as a single black box against every actor and external system that touches it (MSAG "System Model — functional aspect"). Actors are tagged A1 (Customer), B1–B6 (the six internal roles) and B7 (Administrator), and C1–C4 (Partner Workshop, Car Rental Partner, Authorized Service Station, and the External Workshop, which has no eClaims access). External systems are tagged D1–D6 (Stripe, Okta, SNS, SES, APNs / FCM, Amazon Location Service) and E1–E3 (the deferred car-rental API, customer-supplied evidence, and YCompany's Policy Administration System). The box shows the four channels including the Mobile App, nine capabilities, the extended lifecycle and the event catalogue. An interaction register beneath the diagram tags each of the 22 flows with what crosses the boundary and over which channel or protocol; flows ⑰–㉒ were appended in v1.9, so earlier numbers are unchanged.
2. **High Level Solution** — a single compact one-page view of the entire solution (MSAG "Solution diagram"), aimed at senior stakeholders. Bands A–F run top to bottom (Users, Channels, Secure Edge, Business Capabilities C1–C8, Event Backbone, Information & Cloud Platform E1–E8, External Systems F1–F8). Every channel, including the Mobile App, enters the secure edge, drawn as the chain Route 53 + ARC → WAF → CloudFront → ALB → Auth. Each capability reaches its data, and capabilities consume and publish events both ways. The end-to-end claim flow is numbered ①–⑩ on the edges and walked in prose in the notes panel.
3. **Logical Architecture** — a technology-agnostic, layered view (MSAG "Application / Component Logical Architecture") naming roles rather than products, so it applies equally to the cloud or on-premise deployment option (§7):
   - the presentation layer includes the Mobile App and the Administration Console;
   - functional modules are tagged M1–M16;
   - the integration layer shows the outbox relay, dead-letter and replay, the scheduler, change-data capture and inbound callbacks;
   - the data layer shows a store per module group, the audit store and the communication archive;
   - cross-cutting concerns X1–X12 are drawn once in a dedicated right-hand column.

   Page 4 gives the concrete technology mapping of every role shown here.
4. **Layered Solution Architecture** — the six layers as horizontal swim-lanes, with directional data flows annotated by protocol or event:
   - **Services and data.** All thirteen Layer 3 services, each with its own database, behind RDS Proxy and an in-Region read replica.
   - **Events.** Every publisher drops into one bus to the transactional outbox relay, and one bus rises from SQS (a queue per consumer, with dead-letter queues) to the consumers. Each service box lists the events it publishes (⇢).
   - **Documents.** The validated upload path — pre-signed POST, GuardDuty scan, confirmation and claim link — and the indexing consumer.
   - **Payments.** Stripe's hosted payment page, webhooks and Connect payouts.
   - **Other flows.** The Policy Administration System checks; the communications archive; EventBridge Scheduler jobs; the zero-ETL feed into Redshift; the Audit DB with its Object Lock archive; the active-Region (ARC) check made by side-effect tasks.
   - **Conventions.** Workflows ①–⑤ are colour-coded on the arrows and route labels; a hop that several workflows share is drawn in dark grey with their numbers on its label. External systems sit in a right-hand column with their page 1 tags. A capability-mapping callout explains the Layer 2 API-Gateway design decision (§4).
5. **Cloud / Deployment Architecture** — the AWS network-topology realisation of the six layers above (MSAG "System Model — Technical aspect": deployment type, network type, data transmission), for the Phase 1 footprint: us-east-1 primary and us-east-2 warm standby, each Multi-AZ (§10). Every component is drawn with real AWS Architecture Icons inside proper AWS group containers (Region/VPC/AZ/Subnet/Security-Group), scoped to this page and page 6 only.
   - **Edge.** Route 53 (G1) fronts a global edge tier (G2 WAF + Shield, G3 CloudFront, G4 ARC routing controls). CloudFront has two origins: the S3 portal files and the ALB, which accepts traffic only from CloudFront.
   - **us-east-1.** One regional ALB (V1) is drawn as a band across the zones. Each zone repeats the public/private/data pattern: NAT Gateway, Fargate tasks with RDS Proxy (V7), RDS with a database per service (V4), in-Region read replica (V8), Audit DB (V9), ElastiCache and OpenSearch. A Redshift band (V10) sits in the data subnets.
   - **Managed services.** N1–N18 include the EventBridge Scheduler, GuardDuty Malware Protection, Security Hub with Inspector and Macie, AWS Backup, CloudWatch Synthetics, ACM and Amazon Location Service.
   - **us-east-2.** It repeats the pattern in compact form (V1′–V10′, N1′–N15′), including RDS Proxy, the Audit DB replica, the restored Redshift and the standby event, workflow and scheduler services.
   - **Flows.** Browser and app uploads go straight to S3, Stripe webhooks come in, and SNS delivers mobile push (D5). A registry table indexes every tag.
6. **CI/CD Pipeline** — the release workflow behind Layer 6's CodePipeline/CodeBuild/CodeDeploy/ECR toolchain, chosen for its fully-managed, pay-per-use cost profile over a self-run alternative like Jenkins. A push to GitHub (P1, through AWS CodeConnections) triggers CodePipeline (P2) through five stages:
   - **Build & Scan:** P4 → P5, with code scans (Q5) and Amazon Inspector image scanning (Q4).
   - **Infrastructure:** P6, Checkov, then Terraform plan/apply behind a manual approval gate.
   - **Pre-production in the development and staging accounts:** the migration task (P17), a blue/green deploy (P14), the k6, integration and ZAP gates (P15), and the mobile build to TestFlight and Google Play (P19).
   - **Release approval:** P16.
   - **Production:** CodeDeploy (P7) shifts ALB traffic between the Blue (P10) and Green (P11) task sets, while Synthetics canaries (P18) and a CloudWatch alarm (R1) can roll back. ECR replicates each image to us-east-2 (P12), and a cross-Region CodeDeploy action (P13) repeats the release there.
7. **Bounded Contexts (Domain View)** — the Customer, Internal and Partner domains with every Layer 3 service placed in one of them. Partner capabilities are mapped to the services that own them, and E3 sits outside the domains. Events are drawn both ways — what each domain publishes and what the backbone delivers to it — and the shared platform names the application audit trail, with CloudTrail as infrastructure audit only.

Pages 1–3, 5 and 6 completed the Nagarro MSAG diagram set (`requirements/MSAG-Diagram-Preparation-Guidelines-v1.1.pdf`); pages 4 and 7 come from the original two-page deliverable. All seven pages were revised for v1.9.

To view or edit: open the file in the diagrams.net desktop application or at https://app.diagrams.net.
