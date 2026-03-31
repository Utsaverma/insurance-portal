---
description: 'Agent Instructions for eClaims Insurance Portal Development. Establishes coding standards, architectural principles, quality requirements, and project context for the modernized claims processing system.'
---

# eClaims Insurance Portal - Agent Development Instructions

## Project Overview

This document formalizes the coding standards, architectural practices, and quality requirements for developing the **eClaims Insurance Portal** - a modernized claims processing system for YCompany, a major US-based insurance provider serving 200+ million customers.

### Strategic Context

**Problem**: YCompany's manual claims processing causes:
- Long claim settlement times (days/weeks)
- Customer dissatisfaction and lost confidence
- High operational costs due to manual workflows
- No real-time tracking or analytics capability
- Competitive disadvantage vs. industry peers

**Solution**: Build an electronic claims management system with customer portal, mobile app, partner integrations, and automated workflows to achieve faster settlements and improved customer experience.

---

## Core Coding Standards

All agents must adhere to these non-negotiable standards:

### 1. Code Quality & Readability
- **Clean & Readable Code**: Write code that tells a clear story with minimal cognitive load
- **Naming Conventions**: Use consistent, descriptive names (no abbreviations unless standard)
- **DRY Principle**: Don't Repeat Yourself - extract common logic into reusable functions/modules
- **KISS Principle**: Keep It Simple, Stupid - avoid over-engineering
- **YAGNI Principle**: You Aren't Gonna Need It - don't implement unused features

### 2. Documentation
- **Comments & Docstrings**: Explain the "why" not the "what". Every function/class must have clear documentation
- **README Files**: Include setup, usage, and architecture documentation
- **Decision Records**: Document significant technical decisions with rationale
- **Code Examples**: Provide usage examples for complex functionality

### 3. Error Handling & Logging
- **Comprehensive Error Handling**: Gracefully handle all error paths with clear recovery strategies
- **Structured Logging**: Use consistent log levels (DEBUG, INFO, WARN, ERROR) with contextual information
- **No Silent Failures**: Always log errors with full context before attempting recovery
- **User-Friendly Messages**: Never expose internal stack traces to end users

### 4. Modularity & Separation of Concerns
- **Single Responsibility**: Each module/function should have one clear purpose
- **Loose Coupling**: Minimize dependencies between modules
- **High Cohesion**: Related functionality should be grouped together
- **Layered Architecture**: Organize code into clear layers (API → Service → Repository → Database)

### 5. Testing
- **Unit Tests**: Write comprehensive unit tests for all business logic (target >80% coverage)
- **Integration Tests**: Test service boundaries and data flows
- **E2E Tests**: Test critical user journeys end-to-end
- **Automated Testing**: All tests must run automatically in CI/CD pipeline
- **Test Data**: Use realistic test fixtures and data sets

### 6. Performance & Maintainability
- **Code Reviews**: All code must be reviewed before merge
- **Regular Refactoring**: Continuously improve code structure and eliminate technical debt
- **Dependency Management**: Keep dependencies up to date and minimize external library usage
- **Performance Optimization**: Profile critical paths and document performance decisions

---

## Architectural Principles

### Design for Quality Attributes
**ALWAYS PRIORITIZE** these 8 quality areas in this order:

1. **Security** - Protection against unauthorized access and data breaches
2. **Availability** - System uptime and operational continuity (24/7 requirement)
3. **Scalability** - Handle growth in users, transactions, and data volume
4. **Maintainability** - Easy to understand, modify, and extend
5. **Performance** - Response times and throughput (99% <5000ms SLA)
6. **Reliability** - Consistent, predictable behavior with graceful failure modes
7. **Usability** - Intuitive interfaces and clear user experience
8. **Extensibility** - Flexible design enabling future feature additions

### Design Principles

- **Design for Evolution**: Anticipate future requirements and build flexibility into the system
- **Componentize as Services**: Break functionality into independently deployable microservices
- **Separation of Concerns**: Clearly distinct layers (API, Business Logic, Data Access, Infrastructure)
- **SOLID Principles**:
  - Single Responsibility Principle
  - Open/Closed Principle  
  - Liskov Substitution Principle
  - Interface Segregation Principle
  - Dependency Inversion Principle

### Architecture Patterns

- **Layered Architecture**: API → Controllers → Services → Repositories → Database
- **Repository Pattern**: Abstract data access logic
- **Dependency Injection**: Decouple components and improve testability
- **Event-Driven**: Use events for asynchronous communication between services
- **Circuit Breaker**: Graceful handling of external service failures

### Deployment & Infrastructure

- **24/7 Availability**: System must remain operational with auto-recovery from crashes
- **Multi-Environment Support**: Support on-premise and cloud deployment (AWS)
- **Auto-Scaling**: Handle load spikes automatically
- **Comprehensive Logging**: Enable debugging and performance monitoring

---

## System Architecture Overview

### Core Components

#### 1. **Customer Portal & Mobile App**
- Login via policy credentials
- Report claims and upload supporting documents
- View claim status and real-time updates
- Select partner workshops and arrange appointments
- Book rental vehicles
- Make electronic payments
- Access service provider listings by location

#### 2. **Internal Portal**
- **Role-Based Access Control (RBAC)**:
  - Case Manager: Assign cases, delegate work, view complete case details, override decisions
  - Surveyor: Submit damage assessments online, field work tracking
  - Adjustor: Review claims, submit assessments, calculate claim valuations, approve payments
  - Auditor: Full read-only access to all claims and processing records
  - Regional Manager: Region-specific reporting and metrics
  - Top Management: Cross-region analytics and KPI dashboards

#### 3. **Partner Portal (3rd Party Service Providers)**
- Workshop login and management
- Upload work orders and repair estimates
- Provide real-time repair status updates
- Track pending payments
- Submit final invoice amounts

#### 4. **Alert & Notification System**
- Real-time notifications (SMS/Email) on claim status changes
- Automatic alerts to incident manager, adjustor, surveyor on new claims
- Delivery date notifications for repairs
- Approval amount notifications to customer and workshop
- Archive all communications for compliance

#### 5. **Reporting System**
- Claims processing metrics (time-to-settle, approval rates)
- Fraud detection and reporting
- Aging matrix for pending claims (SLA tracking)
- Role-based report generation:
  - Case Manager: Reports on assigned claims
  - Regional Manager: Geographic and departmental metrics
  - Top Management: Executive dashboards and trend analysis
- Regional comparisons and performance analytics

#### 6. **Document Management System**
- Central repository for all claims documents
- Automatic archival and audit trail
- Encryption and secure storage
- Compliance with regulatory requirements
- Document versioning and retrieval

#### 7. **Incident Management Workflow**
- Automatic claim ID generation
- Intelligent case assignment (based on surveyor availability and location coverage)
- Multi-stage approval workflow:
  - Claim received → Case assigned
  - Vehicle assessed (surveyor) → Assessment submitted
  - Claim adjudicated (adjustor) → Amount approved
  - Customer notified → Payment processed
- Delegation capabilities for unavailable personnel

---

## Functional Requirements (FR)

### FR-1: Data Standards & Interfaces
- Well-defined API specifications (OpenAPI/Swagger)
- Standardized data formats (JSON for APIs, structured DTOs)
- Consistent error response formats
- RESTful API design principles

### FR-2: Identity & Access Management
- Role-Based Access Control (RBAC) system
- Multi-factor authentication support
- Session management and token-based security
- Audit trail for all user actions

### FR-3: Role Configuration
- Configurable role permissions (no code changes required)
- Admin interface for role management
- Role hierarchy and inheritance support
- Delegation and temporary access capabilities

### FR-4: Data Management
- Distributed data storage across geographic regions
- Automatic backup and disaster recovery
- Data consistency and ACID compliance
- Transaction support for critical operations

### FR-5: Data Protection
- Encryption for data at rest (AES-256 minimum)
- Encryption for data in transit (TLS 1.2+)
- Sensitive data masking in logs
- Key management and rotation policies
- PCI-DSS compliance for payment data

### FR-6: Fraud Prevention & Non-Repudiation
- Fraud detection algorithms and rule engine
- Digital signatures for critical transactions
- Tamper-proof audit logs
- Claim verification workflows

---

## Non-Functional Requirements (NFR)

### NFR-1: Scalability
- Horizontal scaling to handle 200+ million customers
- Database sharding capability
- Load balancing across multiple instances
- Caching strategy (Redis/Memcached)
- Message queue for asynchronous processing

### NFR-2: Deployment Flexibility
- **On-Premise**: Self-hosted deployment support
- **Cloud-Native**: Full AWS/Azure support with auto-scaling
- **Containerization**: Docker/Kubernetes ready
- **Infrastructure as Code**: Terraform/CloudFormation templates

### NFR-3: Performance (Critical SLA)
- **99% of requests must complete in <5000 milliseconds**
- Applies to both peak and non-peak hours
- Database query optimization (sub-100ms target)
- API response time tracking and alerts
- Caching for frequently accessed data

### NFR-4: Reliability & Monitoring
- 99.9% uptime SLA (maximum 43 minutes/month downtime)
- Health checks and automated failure detection
- Self-healing capabilities (auto-restart on crash)
- Comprehensive monitoring (application, infrastructure, business metrics)
- Real-time alerting for critical issues
- Log aggregation and analysis (ELK stack)

### NFR-5: Security (OWASP Top 10 Protection)
1. **Injection Prevention**: Parameterized queries, input validation
2. **Broken Authentication**: Strong password policies, session management, MFA
3. **Sensitive Data Exposure**: Encryption at rest and in transit, data classification
4. **XML External Entities (XXE)**: Disable XML external entity parsing
5. **Broken Access Control**: RBAC enforcement at every layer, API authorization
6. **Security Misconfiguration**: Infrastructure hardening, minimal attack surface
7. **Cross-Site Scripting (XSS)**: Input/output encoding, Content Security Policy
8. **Insecure Deserialization**: Safe deserialization practices, version control
9. **Using Components with Known Vulnerabilities**: Dependency scanning, regular updates
10. **Insufficient Logging & Monitoring**: Comprehensive audit trails, real-time alerts

### NFR-6: Maintainability & Upgradability
- Zero-downtime deployments using blue-green strategy
- Backward API compatibility
- Database migration support (versioning)
- Feature flags for gradual rollouts
- Extensive documentation and runbooks

### NFR-7: Localization
- English-only UI requirement
- UTF-8 encoding support (future multi-language ready)
- Single timezone support (US-based)

---

## Project Documentation Requirements

### 1. Architecture Documentation
- **System Context Diagram**: High-level system boundaries and actors
- **Container Diagram**: Application components and databases
- **Component Diagram**: Internal service structure
- **Technology Stack Document**: Frameworks, libraries, infrastructure choices
- **Update Frequency**: Every sprint or major architectural change

### 2. Architecture Decision Records (ADR)
- **Location**: `docs/adr/`
- **Format**: Follow ADR template (Context, Decision, Consequences)
- **Requirement**: Record all significant technical decisions
- **Example Topics**: Framework choice, database selection, deployment strategy

### 3. Conversation Logs
- **Location**: `conversations/<YYYY-MM-DD-HH-MM-SS>.md`
- **Content**: Agent interactions, decisions, implementation notes
- **Security**: No sensitive data (passwords, API keys, PII) in logs
- **Privacy**: Compliant with data protection regulations
- **Retention**: Minimum 1 year for audit trail

### 4. Development Documentation
- **Setup Guide**: How to configure local development environment
- **Contributing Guide**: Coding standards, PR process, testing requirements
- **API Documentation**: Auto-generated from OpenAPI specs
- **Database Schema**: Entity-relationship diagrams with documentation
- **Deployment Guide**: Steps for different environments

---

## Quality Gates & Validation Checklist

### Code Review Quality Gates
- [ ] All requirements implemented and tested
- [ ] Code follows naming conventions and style guide
- [ ] Documentation is complete and accurate
- [ ] No security vulnerabilities (static analysis passed)
- [ ] Unit test coverage >80% for new code
- [ ] All tests passing in CI pipeline
- [ ] Performance benchmarks met (SLA <5000ms)
- [ ] ADR created for significant decisions
- [ ] No technical debt introduced

### Pre-Deployment Checklist
- [ ] All functional requirements verified
- [ ] All non-functional requirements validated
- [ ] Security assessment completed (OWASP compliance)
- [ ] Load testing passed (99.9% SLA validated)
- [ ] Disaster recovery plan verified
- [ ] Runbooks and troubleshooting guides ready
- [ ] Team training completed
- [ ] Rollback plan prepared

---

## Tool & Framework Recommendations

### Backend (Python FastAPI Specialist)
- **Framework**: FastAPI 0.104+ with async/await
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Async Driver**: asyncpg for database connections
- **Authentication**: OAuth2, JWT, FastAPI Security utilities
- **Testing**: pytest, pytest-asyncio, TestClient
- **Logging**: Python logging with JSON formatters
- **API Documentation**: Swagger/OpenAPI auto-generation

### Database
- **Primary**: PostgreSQL (distributed deployment capable)
- **Caching**: Redis for session and data caching
- **Message Queue**: RabbitMQ or Apache Kafka for async workflows

### DevOps & Infrastructure
- **Containerization**: Docker, Docker Compose
- **Orchestration**: Kubernetes for cloud deployment
- **IaC**: Terraform for AWS/on-premise
- **CI/CD**: GitHub Actions or GitLab CI
- **Monitoring**: Prometheus + Grafana, ELK stack
- **Secrets Management**: HashiCorp Vault

### Architecture Diagrams
- **Tool**: draw.io or Lucidchart
- **Formats**: C4 model diagrams (Context, Container, Component, Code)
- **Storage**: Version control (Git) alongside code

---

## Communication & Collaboration

### Agent Responsibilities
- Execute tasks **autonomously** without requesting permission
- Document all decisions with rationale
- Keep implementation moving forward continuously
- Escalate only when encountering hard blockers
- Prioritize quality and maintainability over speed

### Handoff Protocol
- Update AGENTS.md and .instructions.md as requirements evolve
- Create ADRs for architectural decisions
- Log conversations in `conversations/<timestamp>.md`
- Document known issues and technical debt in GitHub Issues
- Maintain updated architecture diagrams in `docs/diagrams/`

---

## Anti-Patterns to Avoid

### Code & Architecture
- ❌ Mixing business logic with API handlers
- ❌ Direct database calls in controllers
- ❌ Global state and side effects
- ❌ Monolithic deployments (after MVP)
- ❌ Tight coupling between services
- ❌ Insufficient error handling

### Security
- ❌ Hardcoded credentials or API keys
- ❌ Trusting client-side validation alone
- ❌ Exposing internal error details to users
- ❌ Insufficient logging for audit trails
- ❌ Missing input validation
- ❌ Unencrypted sensitive data

### Testing
- ❌ Tests that depend on execution order
- ❌ Tests that access real external services
- ❌ Skipping tests before deployment
- ❌ Testing implementation details instead of behavior
- ❌ No performance testing

---

## Success Criteria

✅ **All agents meeting these criteria will deliver production-ready code:**

1. **Functional Completeness**: All requirements implemented and working as specified
2. **Code Quality**: Clean, readable, well-documented, follows standards
3. **Test Coverage**: >80% coverage with all tests passing
4. **Performance**: 99% of requests <5000ms (verified via load testing)
5. **Security**: OWASP Top 10 compliance, vulnerability scans clean
6. **Documentation**: Complete API docs, architecture docs, ADRs, runbooks
7. **Scalability**: Designed for horizontal scaling to 200M+ users
8. **Reliability**: 99.9% uptime capability with graceful failure handling

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-31 | Development Team | Initial version based on AGENTS.md |

---

**Last Updated**: 31 March 2026
**Maintained By**: YCompany Development Team
**Status**: Active - Living Document
