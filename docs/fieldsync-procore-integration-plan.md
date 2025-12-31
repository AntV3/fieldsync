# fieldsync-procore-integration-plan.md

**Document Type:** Principal Architecture & Product Strategy
**Status:** Living Design Document
**Last Updated:** December 30, 2024
**Author:** Principal Software Architect

---

## Introduction

This document defines the strategic approach for integrating FieldSync with Procore, the dominant construction management platform. It establishes principles, boundaries, phasing, and success criteria to guide future implementation decisions.

**Core Premise:** FieldSync excels at field-first data capture. Procore excels at project management and serves as the system of record for most general contractors. The integration should leverage both strengths without creating competing functionality, tight coupling, or maintenance burden that undermines FieldSync's core value proposition.

This document is intentionally conservative. It prioritizes resilience, simplicity, and user value over feature completeness.

---

## 1. Integration Intent

### 1.1 Why Integrate with Procore?

Procore is the de facto standard for construction project management across mid-to-large general contractors and many specialty subcontractors. Integration with Procore:

- **Eliminates double-entry** — Field data captured in FieldSync flows to Procore without manual re-keying
- **Reduces adoption friction** — Companies already using Procore can adopt FieldSync without abandoning existing workflows
- **Accelerates billing cycles** — T&M and COR data reaches billing teams faster with less transcription error
- **Positions FieldSync as complementary** — Not a Procore replacement, but a field-capture enhancement

### 1.2 Value by Stakeholder

| Stakeholder | Current Pain Point | Integration Value |
|-------------|-------------------|-------------------|
| **Foremen / Field Users** | Data entered in FieldSync must be re-entered elsewhere | "Enter once, done" — field data flows automatically |
| **Office Staff / PMs** | Chasing paper T&M tickets; manual data consolidation | Real-time visibility; reduced admin burden |
| **Executives / Billing** | Delayed change order processing; disputes over documentation | Faster billing cycles; defensible audit trail |
| **IT / Admins** | Managing disconnected systems | Single integration point; reduced tooling sprawl |

### 1.3 System Roles & Ownership

| Domain | FieldSync Owns | Procore Owns |
|--------|---------------|--------------|
| **Field Data Capture** | T&M tickets, crew check-ins, daily reports, photos, COR field documentation | — |
| **Project Master Data** | — | Project definitions, budgets, prime contracts, commitments |
| **Change Management** | COR drafts and field backup documentation | Change Events, approved Change Orders, PCOs |
| **Financial Data** | — | Budgets, cost codes, billing, invoicing |
| **User Identity** | FieldSync accounts, PIN-based field auth | Procore user accounts, permissions |
| **Document Storage** | Field photos (transient/operational) | Long-term document archive |

### 1.4 Acceptable Overlap vs. Dangerous Duplication

**Acceptable Overlap:**
- Project names and identifiers (read-only sync from Procore)
- Change Event references (for linking, not management)
- Photo thumbnails (FieldSync operational, Procore archival)

**Dangerous Duplication to Avoid:**
- Maintaining parallel change order workflows
- Duplicating cost code management
- Building a "mini-Procore" inside FieldSync
- Real-time bidirectional sync of mutable data

### 1.5 Explicit Non-Goals

FieldSync should **never** attempt to:

1. Replace Procore's project setup or configuration workflows
2. Manage budgets, cost codes, or financial data
3. Serve as a document management system
4. Provide Procore-style reporting or dashboards
5. Become the system of record for anything Procore already owns
6. Require Procore to function — integration is always optional
7. Build features that only make sense in a Procore context

---

## 2. High-Value Integration Surfaces

### 2.1 Entity Evaluation Matrix

| Procore Entity | User Value | Complexity | Risk | Recommendation |
|----------------|------------|------------|------|----------------|
| **Projects** | High — enables project linking | Low | Low | **Phase 1** |
| **Change Events** | High — T&M/COR linking | Medium | Medium | **Phase 2** |
| **Change Orders (PCOs)** | High — billing workflow | Medium-High | Medium | **Phase 2** |
| **Commitments** | Low — subcontractor focus | High | High | **Defer** |
| **Daily Logs** | Medium — operational continuity | Medium | Medium | **Phase 3+** |
| **Timecards** | Medium — labor tracking | Medium-High | High | **Evaluate** |
| **T&M Tickets** | Very High — core FieldSync value | Medium | Medium | **Phase 2** |
| **Photos** | High — backup documentation | Low-Medium | Low | **Phase 2-3** |
| **Documents** | Low — not FieldSync's domain | High | High | **Avoid** |

### 2.2 Entity Details

#### Projects (Phase 1 — Foundation)

**Value:** Project sync enables all downstream integrations. Without project mapping, nothing else works.

**Scope:**
- Pull project list from Procore (read-only)
- Map Procore projects to FieldSync projects
- Sync basic metadata: name, job number, address, status

**Risks:**
- Project structure differences between systems
- Stale data if projects change in Procore

**Recommendation:** Essential foundation. Keep scope minimal — ID, name, status only.

---

#### Change Events (Phase 2)

**Value:** Change Events are Procore's container for potential change orders. Linking FieldSync CORs to Change Events enables:
- Proper categorization in Procore
- Cost tracking against the correct bucket
- Audit trail from field to billing

**Scope:**
- Pull Change Event list for linked projects
- Allow FieldSync COR to reference a Change Event
- Push COR data as Change Event documentation

**Risks:**
- Change Event structure varies by Procore configuration
- Timing mismatches (CE may not exist when COR is created)

**Recommendation:** High value but requires careful UX design for the "no CE yet" scenario.

---

#### Change Orders / PCOs (Phase 2)

**Value:** The ultimate destination for COR data. Pushing approved CORs to Procore as PCOs completes the billing cycle.

**Scope:**
- Push finalized COR as a Potential Change Order (PCO)
- Include labor, materials, equipment line items
- Attach supporting documentation (T&M tickets, photos)

**Risks:**
- PCO creation may require specific permissions
- Line item format must match Procore expectations
- Partial push failures leave orphaned data

**Recommendation:** Core Phase 2 deliverable. Design for idempotency and clear failure states.

---

#### T&M Tickets (Phase 2)

**Value:** Procore has a dedicated T&M module. Pushing FieldSync T&M tickets to Procore:
- Centralizes documentation
- Enables Procore-native approval workflows
- Satisfies customers who mandate "everything in Procore"

**Scope:**
- Push T&M ticket data (workers, hours, materials)
- Attach photos as supporting documentation
- Link to Change Event if applicable

**Risks:**
- Procore T&M module availability varies by subscription
- Field-level detail may not map cleanly

**Recommendation:** High value for customers using Procore T&M. Make optional per-tenant.

---

#### Photos / Attachments (Phase 2-3)

**Value:** Photos are critical backup documentation. Pushing photos to Procore:
- Creates permanent archival record
- Satisfies GC documentation requirements
- Enables photo access in Procore mobile

**Scope:**
- Push photos attached to T&M tickets and CORs
- Associate with correct project/Change Event
- Handle large files gracefully

**Risks:**
- File size limits and upload failures
- Storage costs (Procore side)
- Photo quality/compression decisions

**Recommendation:** Important but secondary to core data. Phase 2 or 3 depending on capacity.

---

#### Daily Logs (Phase 3+)

**Value:** Some customers want unified daily reporting. Pushing FieldSync daily reports to Procore Daily Log:
- Eliminates duplicate entry
- Creates comprehensive project diary

**Scope:**
- Map FieldSync daily report fields to Procore Daily Log
- Push weather, crew, notes, photos

**Risks:**
- Daily Log structure is highly configurable in Procore
- Field naming and categorization varies widely
- Lower priority than billing-critical workflows

**Recommendation:** Defer to Phase 3+. Validate customer demand before investing.

---

#### Timecards (Evaluate)

**Value:** Labor hours for payroll and cost tracking.

**Scope:**
- Push worker hours from T&M tickets
- Map to Procore timecard structure

**Risks:**
- Overlaps with dedicated timekeeping systems
- Union rules and prevailing wage complexity
- High sensitivity — errors affect paychecks

**Recommendation:** Evaluate carefully. Many customers have dedicated time systems. Avoid unless strong demand.

---

#### Commitments (Defer)

**Value:** Limited — primarily for subcontractor management.

**Recommendation:** Out of scope. FieldSync is not a subcontractor management tool.

---

#### Documents (Avoid)

**Value:** Minimal — FieldSync is not a document management system.

**Recommendation:** Explicitly avoid. Point customers to Procore Documents directly.

---

## 3. Integration Models (Conceptual)

### 3.1 One-Way Push (FieldSync → Procore)

**Description:** FieldSync captures data in the field and pushes it to Procore. Procore is the final destination and system of record.

**Benefits:**
- Simple mental model for users
- Clear data ownership (FieldSync = capture, Procore = record)
- Failure handling is straightforward (retry or alert)
- No conflict resolution needed
- FieldSync remains fully functional if Procore is unavailable

**Risks:**
- Users must check Procore to confirm sync success
- Corrections require manual intervention in Procore
- No visibility into Procore-side changes

**Maintenance:**
- Low ongoing maintenance
- API changes are the primary risk

**Recommendation:** **Primary model for most data flows.** T&M tickets, CORs, photos should all follow this pattern.

---

### 3.2 One-Way Pull (Procore → FieldSync)

**Description:** FieldSync reads reference data from Procore to enable linking and validation.

**Benefits:**
- Ensures FieldSync uses authoritative project/CE data
- Reduces data entry (project selection from list)
- Enables proper categorization and linking

**Risks:**
- Stale data if not refreshed appropriately
- Procore API availability affects FieldSync UX
- Must handle missing/deleted entities gracefully

**Maintenance:**
- Moderate — caching and refresh logic required

**Recommendation:** **Use for reference data only.** Projects, Change Events, cost codes (if needed). Never for mutable operational data.

---

### 3.3 Hybrid / Two-Way Sync

**Description:** Data flows both directions with conflict resolution.

**Benefits:**
- Theoretical: "single source of truth" across systems

**Risks:**
- Conflict resolution is complex and error-prone
- Requires real-time sync or sophisticated merge logic
- Creates tight coupling between systems
- Failure modes are difficult to explain to users
- Maintenance burden is high and ongoing

**Maintenance:**
- Very high — conflict resolution, edge cases, API changes

**Recommendation:** **Avoid for initial phases.** Only consider for specific, well-bounded use cases after proving simpler models work. Even then, prefer "pull reference, push operational" over true bidirectional sync.

---

### 3.4 Recommended Model Summary

| Data Type | Direction | Rationale |
|-----------|-----------|-----------|
| Projects | Pull | Reference data; Procore authoritative |
| Change Events | Pull | Reference data for linking |
| Cost Codes | Pull (if needed) | Reference data for categorization |
| T&M Tickets | Push | FieldSync captures, Procore archives |
| CORs / PCOs | Push | FieldSync drafts, Procore finalizes |
| Photos | Push | FieldSync captures, Procore archives |
| Daily Reports | Push | FieldSync captures, Procore archives |

---

## 4. Multi-Tenant & Authorization Considerations

### 4.1 OAuth 2.0 Flow

Procore uses OAuth 2.0 with company-level authorization. Key considerations:

- **Authorization is per-company, not per-user** — A FieldSync tenant admin authorizes the connection for their entire company
- **Scopes must be requested carefully** — Request minimum necessary permissions
- **Tokens have expiration** — Refresh token handling is critical
- **Users can revoke at any time** — From Procore side, without FieldSync notification

### 4.2 Token Management

| Concern | Approach |
|---------|----------|
| Token Storage | Encrypted, per-tenant, never in client-side code |
| Token Refresh | Automatic, before expiration, with retry logic |
| Refresh Failure | Alert tenant admin; disable sync; do not block field ops |
| Revocation Detection | Detect 401 responses; mark integration as disconnected |
| Re-authorization | Simple flow for tenant admin to reconnect |

### 4.3 Tenant-to-Company Mapping

- One FieldSync tenant maps to one Procore company
- One Procore company may have multiple projects visible
- Projects are mapped individually (not all-or-nothing)
- Mapping is stored in FieldSync; Procore is unaware of FieldSync

### 4.4 Failure Handling

| Failure Scenario | Behavior |
|------------------|----------|
| **Token Expired** | Auto-refresh; if refresh fails, alert admin |
| **Authorization Revoked** | Mark integration disconnected; alert admin; field ops continue |
| **API Downtime** | Queue sync attempts; retry with backoff; alert after threshold |
| **Rate Limiting** | Respect limits; queue and throttle; never drop data |

### 4.5 Security Boundaries

- **Tenant Isolation:** Each tenant's Procore credentials are completely isolated
- **No Cross-Tenant Access:** A sync failure in Tenant A cannot affect Tenant B
- **Audit Trail:** All API calls logged with tenant context
- **Data Minimization:** Only sync what's needed; don't pull entire Procore database

---

## 5. User Experience (Conceptual)

### 5.1 Who Enables Integration

- **Tenant Admin only** — Not project managers, not field users
- **Explicit opt-in** — Integration is never automatic
- **Clear permissions display** — Show what FieldSync will access in Procore

### 5.2 Integration Settings Location

Settings should live in a dedicated **Integrations** section within FieldSync admin:

- Company Settings → Integrations → Procore
- Clear connect/disconnect actions
- Status indicator (Connected, Disconnected, Error)
- Last sync timestamp
- Link to Procore authorization settings

### 5.3 Sync Triggers

| Trigger Type | Use Case | Behavior |
|--------------|----------|----------|
| **Manual** | User-initiated push | "Sync to Procore" button on COR/T&M detail |
| **Scheduled** | Batch sync | Hourly/daily sync of pending items |
| **Event-Driven** | Automatic on action | Push when COR is marked "approved" |

**Recommendation:** Start with manual triggers only. Add scheduled/event-driven after proving reliability.

### 5.4 Visibility Requirements

Users must always be able to answer:

1. **"Did this sync to Procore?"** — Clear yes/no/pending indicator
2. **"When did it sync?"** — Timestamp visible on synced items
3. **"Why didn't it sync?"** — Human-readable error message
4. **"Can I retry?"** — Manual retry option for failed syncs
5. **"What exactly was sent?"** — Audit log accessible to admins

### 5.5 UX Principles

1. **No silent failures** — Every sync attempt has a visible outcome
2. **User-controllable** — Users decide when to sync (at least initially)
3. **Transparent** — Clear indication of what data goes where
4. **Non-blocking** — Sync failures never prevent field work
5. **Recoverable** — Failed syncs can be retried without data loss
6. **Explainable** — Errors are human-readable, not API codes

---

## 6. Phased Roadmap

### Phase 0: Research & Validation

**Goal:** Validate integration value and technical feasibility before committing.

**Activities:**
- Customer interviews: Who uses Procore? What would they sync?
- Procore API exploration: Authentication, rate limits, available endpoints
- Competitive analysis: How do others integrate?
- Legal/partnership: Procore marketplace requirements

**Key Deliverables:**
- Customer demand validation report
- Technical feasibility assessment
- Partnership/marketplace requirements summary

**Success Criteria:**
- 5+ customers express strong interest in integration
- No blocking technical constraints identified
- Clear path to Procore marketplace (if desired)

**No-Go Criteria:**
- Insufficient customer demand
- Procore API limitations that prevent core use cases
- Unreasonable partnership/legal requirements

**Timeline Estimate:** 2-4 weeks

---

### Phase 1: Project Sync (Foundation)

**Goal:** Establish basic connectivity and project mapping.

**Scope:**
- OAuth 2.0 connection flow
- Pull project list from Procore
- Map Procore projects to FieldSync projects
- Basic connection status and error handling

**Key User Value:**
- "My Procore projects appear in FieldSync"
- Foundation for all future sync capabilities

**Risk Level:** Low-Medium

**Dependencies:**
- Procore API access
- OAuth implementation
- Admin UI for integration settings

**Success Criteria:**
- Tenant admin can connect FieldSync to Procore
- Projects sync successfully
- Connection status is clearly visible
- Disconnect works cleanly

**No-Go / Rollback Criteria:**
- OAuth flow unreliable (>5% failure rate)
- Project sync causes data corruption
- Performance impact on FieldSync core features

**Timeline Estimate:** 3-4 weeks

---

### Phase 2: Change Events & COR/T&M Push

**Goal:** Enable core value proposition — field data flows to Procore.

**Scope:**
- Pull Change Events for project linking
- Push T&M tickets to Procore (as T&M or documentation)
- Push CORs as Potential Change Orders (PCOs)
- Sync status indicators on all pushed items
- Manual sync triggers (button on each item)

**Key User Value:**
- "I enter T&M in the field, it appears in Procore"
- "My COR is ready for billing in Procore"
- Eliminates double-entry for change management

**Risk Level:** Medium

**Dependencies:**
- Phase 1 complete
- Clear mapping between FieldSync data model and Procore entities
- Error handling and retry infrastructure

**Success Criteria:**
- T&M tickets sync to Procore with <2% error rate
- CORs create valid PCOs in Procore
- Sync failures are visible and retryable
- No data loss during sync attempts

**No-Go / Rollback Criteria:**
- Sync reliability <95%
- Data mapping creates incorrect records in Procore
- Customer complaints about billing errors from synced data

**Timeline Estimate:** 6-8 weeks

---

### Phase 3: Photos & Attachments

**Goal:** Complete documentation by including photos.

**Scope:**
- Push photos attached to T&M tickets
- Push photos attached to CORs
- Associate photos with correct Procore entities
- Handle large file uploads gracefully

**Key User Value:**
- "My field photos are archived in Procore"
- Complete backup documentation for disputes

**Risk Level:** Low-Medium

**Dependencies:**
- Phase 2 complete
- Procore attachment API understanding
- File handling infrastructure

**Success Criteria:**
- Photos sync with T&M/COR data
- Large files handled without timeout
- Photo quality preserved appropriately

**No-Go / Rollback Criteria:**
- Photo sync causes significant performance degradation
- Storage costs become problematic
- Photo quality issues create customer complaints

**Timeline Estimate:** 3-4 weeks

---

### Phase 4: Advanced & Optional Features

**Goal:** Address secondary use cases based on customer demand.

**Potential Scope:**
- Daily Log integration
- Scheduled/automatic sync triggers
- Cost code sync and validation
- Enhanced reporting on sync activity
- Webhook-based real-time updates

**Key User Value:**
- Varies by feature; driven by customer demand

**Risk Level:** Variable

**Dependencies:**
- Phases 1-3 stable
- Clear customer demand for specific features

**Success Criteria:**
- Features adopted by requesting customers
- No regression in core integration reliability

**Timeline Estimate:** Ongoing, feature-by-feature

---

## 6.5 Data Ownership, Mutability & Conflict Handling

### 6.5.1 Authority After Sync

| Data Type | Pre-Sync Authority | Post-Sync Authority |
|-----------|-------------------|---------------------|
| T&M Ticket | FieldSync | **Procore** (FieldSync copy is historical) |
| COR / PCO | FieldSync (draft) | **Procore** (FieldSync copy is historical) |
| Photos | FieldSync | **Both** (operational copy in FieldSync, archive in Procore) |
| Projects | Procore | **Procore** (FieldSync is read-only) |
| Change Events | Procore | **Procore** (FieldSync is read-only) |

### 6.5.2 Post-Sync Editability

**Principle:** Once data is pushed to Procore, FieldSync's copy becomes read-only historical record.

- **T&M Tickets:** Editable in FieldSync until synced; read-only after sync
- **CORs:** Editable in FieldSync until synced; read-only after sync
- **Corrections:** Must be made in Procore; FieldSync shows "synced" status

**Rationale:** Avoiding bidirectional sync eliminates conflict resolution complexity. Users have one place to make corrections (Procore), and FieldSync maintains an audit trail of what was originally captured.

### 6.5.3 Handling Corrections

| Scenario | Approach |
|----------|----------|
| **Pre-sync error discovered** | Edit in FieldSync, then sync |
| **Post-sync error discovered** | Correct in Procore; FieldSync shows original as historical |
| **Need to re-sync** | Not supported initially; consider "supersede" pattern later |

### 6.5.4 Duplicate Prevention

- Sync operations must be **idempotent** — re-syncing the same item should not create duplicates
- Each FieldSync item stores Procore entity ID after successful sync
- Procore ID presence indicates "already synced"
- Re-sync attempts update existing Procore entity (if API supports) or are no-ops

### 6.5.5 Partial Sync Failures

| Failure Type | Behavior |
|--------------|----------|
| **Main record fails** | Mark as failed; allow retry; show error |
| **Attachment fails** | Create main record; mark attachment as pending; retry attachment separately |
| **One of many items fails** | Sync successful items; mark failed items; allow individual retry |

### 6.5.6 Explicit Avoidance: Real-Time Bidirectional Sync

FieldSync will **not** implement real-time bidirectional synchronization because:

1. Conflict resolution is inherently complex and error-prone
2. "Last write wins" creates data loss risk
3. Field users cannot be expected to resolve sync conflicts
4. The maintenance burden is disproportionate to the value
5. Procore is the system of record — bidirectional sync undermines this

**Alternative:** If a use case appears to require bidirectional sync, re-examine whether FieldSync is the right tool or whether the workflow should happen entirely in Procore.

### 6.5.7 Auditability for Disputes

All synced data must maintain:

- Original FieldSync capture timestamp
- Original captured values (immutable)
- Sync timestamp
- Sync status (success/failure/pending)
- Procore entity ID (after successful sync)
- Any error messages from failed attempts

This audit trail enables dispute resolution: "What did the foreman actually capture, and when did it reach Procore?"

---

## 7. Risks, Tradeoffs & Open Questions

### 7.1 Over-Integration Risk

**Risk:** Building too much Procore-specific functionality that:
- Doesn't apply to non-Procore customers
- Creates ongoing maintenance burden
- Makes FieldSync feel like "just a Procore add-on"

**Mitigation:**
- Integration is always optional
- Core FieldSync value exists without Procore
- Features are general-purpose first, Procore-integrated second

### 7.2 Vendor Lock-In Potential

**Risk:** Deep Procore integration creates dependency that:
- Makes it hard to support other platforms (Autodesk, CMiC, Sage)
- Gives Procore leverage in partnership negotiations
- Limits FieldSync's market positioning

**Mitigation:**
- Design integration layer to be platform-agnostic where possible
- Abstract sync logic from Procore-specific API calls
- Maintain clear boundaries between FieldSync core and integrations

### 7.3 Long-Term Maintenance Burden

**Risk:** Procore API changes, deprecations, and new versions require ongoing investment.

**Mitigation:**
- Start with stable, well-documented endpoints
- Monitor Procore API changelog and deprecation notices
- Build integration as a separable module
- Consider maintenance cost in feature prioritization

### 7.4 Assumptions Being Made

| Assumption | Risk if Wrong |
|------------|---------------|
| Procore API is stable and reliable | Integration becomes maintenance burden |
| Customers want push, not bidirectional sync | Feature requests for complex sync scenarios |
| One Procore company per FieldSync tenant | Multi-company customers are blocked |
| Project-level mapping is sufficient | Need for more granular control |
| OAuth flow is straightforward | Complex authorization edge cases |

### 7.5 Open Questions Requiring Future Validation

1. **Procore T&M module availability** — How many customers have it? Is it standard or add-on?
2. **Change Event workflow variations** — How much does Procore CE configuration vary across customers?
3. **Marketplace requirements** — What does Procore require for marketplace listing? Is it worth pursuing?
4. **Multi-company scenarios** — Do any customers need to connect multiple Procore companies?
5. **Permission granularity** — Can we get project-level permissions, or is it all-or-nothing?
6. **Webhook availability** — Does Procore offer webhooks for real-time notifications?
7. **Rate limit specifics** — What are actual rate limits? How do they affect batch operations?

---

## 7.5 Observability, Auditability & Supportability

### 7.5.1 What Must Be Observable

At a conceptual level, the integration must expose:

| Observable | Who Sees It | Purpose |
|------------|-------------|---------|
| Sync attempts | Tenant admin | Understanding sync activity |
| Success/failure status | Tenant admin, users | Knowing if data reached Procore |
| Pending items | Tenant admin | Identifying sync backlog |
| Error messages | Tenant admin | Diagnosing failures |
| Last sync timestamp | Users, admin | Recency of sync |
| Connection health | Tenant admin | OAuth and API status |

### 7.5.2 Visibility Boundaries

| Audience | Can See |
|----------|---------|
| **FieldSync SaaS Admin** | All tenants' integration health; aggregate metrics; no customer data |
| **Tenant Admin** | Their company's integration status; sync history; error details |
| **Office Users** | Sync status on items they access |
| **Field Users** | Minimal — "synced" indicator only; no error details |

### 7.5.3 Audit Trail Requirements

For billing, disputes, and support, the system must record:

- **Who** initiated the sync (user or system)
- **What** was synced (entity type, FieldSync ID)
- **When** the sync was attempted and completed
- **Where** it went (Procore entity ID)
- **Whether** it succeeded or failed
- **Why** it failed (error message, API response)

Audit records must be:
- Immutable (append-only)
- Retained for configurable period (minimum 2 years for billing disputes)
- Exportable for support and legal purposes

### 7.5.4 Supportability Principles

1. **No silent failures** — Every sync attempt has a logged outcome
2. **Human-readable errors** — API errors translated to actionable messages
3. **Timestamped actions** — All sync activity has precise timestamps
4. **Traceable requests** — Correlation IDs link FieldSync and Procore operations
5. **Self-service diagnostics** — Tenant admins can see sync history without support tickets
6. **Escalation path** — Clear process when tenant admin diagnostics are insufficient

---

## 7.6 Failure Modes & Degradation Strategy

### 7.6.1 Expected Failure Scenarios

| Scenario | Detection | User Impact | Response |
|----------|-----------|-------------|----------|
| **Procore API unavailable** | HTTP 5xx, timeout | Sync fails; field ops unaffected | Queue syncs; retry with backoff; alert after threshold |
| **OAuth token expired** | HTTP 401 | Sync fails | Auto-refresh; if refresh fails, alert admin |
| **OAuth access revoked** | HTTP 401 after refresh | All syncs fail | Mark disconnected; alert admin; field ops continue |
| **Rate limit exceeded** | HTTP 429 | Sync delayed | Throttle; queue; respect Retry-After |
| **Partial data failure** | Mixed 2xx/4xx | Some items fail | Sync successful items; mark failures; allow retry |
| **Invalid data rejected** | HTTP 400/422 | Specific sync fails | Show error; allow correction and retry |
| **Network partition** | Connection error | Sync fails | Queue; retry; no data loss |

### 7.6.2 Non-Negotiable Behaviors

1. **Field workflows are never blocked** — Procore failures cannot prevent T&M capture, COR creation, or any other field operation
2. **No data loss** — Sync failures queue items for retry; nothing is discarded
3. **Clear status indication** — Users always know whether data synced or not
4. **Manual override available** — Users can always retry failed syncs
5. **Graceful disconnection** — If integration fails completely, FieldSync continues working standalone

### 7.6.3 Degradation Philosophy

**Fail Loud:**
- Sync failures are visible, not hidden
- Alerts are sent to appropriate parties
- Error states are clearly indicated in UI

**Fail Safe:**
- Failures affect sync only, never core functionality
- Partial failures don't corrupt data
- Recovery is always possible

**Degrade Gracefully:**
- If Procore is slow, queue and continue
- If Procore is down, FieldSync works normally without sync
- If OAuth expires, alert admin; don't spam users with errors

### 7.6.4 Recovery Patterns

| State | Recovery Action |
|-------|-----------------|
| **Temporary API failure** | Automatic retry with exponential backoff |
| **Extended API outage** | Queue all syncs; batch process when restored |
| **Token expired** | Automatic refresh; if failed, prompt admin re-auth |
| **Access revoked** | Require admin to re-authorize |
| **Repeated item failure** | Flag for manual review; don't block other items |

---

## 8. Summary & Success Criteria

### 8.1 Integration Intent Summary

FieldSync integrates with Procore to **eliminate double-entry** and **accelerate billing cycles** while maintaining clear system boundaries. FieldSync captures data in the field; Procore serves as the system of record. The integration is optional, unidirectional (push-primary), and designed for resilience over feature completeness.

### 8.2 Recommended Scope

**In Scope (Phases 1-3):**
- OAuth connection and project sync
- T&M ticket push to Procore
- COR/PCO push to Procore
- Photo/attachment sync
- Sync status visibility and retry

**Out of Scope (Explicitly):**
- Bidirectional sync
- Financial data or budgets
- Document management
- Features that only work with Procore

### 8.3 High-Level Conceptual Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FieldSync SaaS                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │  Core Features  │    │ Integration Hub │    │  Admin UI   │ │
│  │  (always works) │    │  (optional)     │    │ (settings)  │ │
│  └────────┬────────┘    └────────┬────────┘    └──────┬──────┘ │
│           │                      │                     │        │
│           └──────────────────────┼─────────────────────┘        │
│                                  │                              │
│                    ┌─────────────▼─────────────┐                │
│                    │   Procore Sync Module     │                │
│                    │   - OAuth management      │                │
│                    │   - Sync queue            │                │
│                    │   - Status tracking       │                │
│                    └─────────────┬─────────────┘                │
└──────────────────────────────────┼──────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │     Procore API (Cloud)     │
                    │  - Projects (pull)          │
                    │  - Change Events (pull)     │
                    │  - T&M, PCOs, Photos (push) │
                    └─────────────────────────────┘
```

**Key Points:**
- Core FieldSync features never depend on Integration Hub
- Procore Sync Module is separable and optional
- Failures in sync do not propagate to core features
- Clear boundaries between pull (reference) and push (operational) data

### 8.4 How This Document Succeeds

This document succeeds if it:

1. **Guides future decisions** — Provides clear principles when implementation questions arise
2. **Avoids premature commitments** — Does not lock in technical choices before validation
3. **Keeps FieldSync focused** — Maintains clarity on what FieldSync is (field capture) vs. what it isn't (Procore replacement)
4. **Enables informed tradeoffs** — When scope decisions arise, this document provides context
5. **Supports incremental delivery** — Phases can be adjusted based on learnings without abandoning the strategy
6. **Remains relevant over time** — Principles and boundaries are durable even as implementation details evolve

---

## 9. Commercial & Product Considerations (Planning Only)

### 9.1 Integration Tier Positioning

| Option | Description | Implications |
|--------|-------------|--------------|
| **Core** | Included in all plans | Sets expectation; increases support burden |
| **Add-On** | Separate purchase | Clear value attribution; sales complexity |
| **Premium/Enterprise** | Included in higher tiers | Upsell driver; may limit adoption |

**Observation:** Most B2B SaaS integrations are included at higher tiers or as paid add-ons. This positions integrations as premium value while managing support expectations.

**Recommendation for Planning:** Assume integration is **not free** — either tier-gated or add-on. This creates appropriate expectations and funds ongoing maintenance. Final pricing decision is out of scope for this document.

### 9.2 Customer Expectation Management

Integration creates expectations:

- "If you integrate with Procore, why not [other platform]?"
- "Can you add [specific Procore feature]?"
- "Why doesn't bidirectional sync work?"

**Mitigation:**
- Clear documentation of integration scope
- Sales enablement on what is/isn't included
- Roadmap transparency for future capabilities

### 9.3 Support Burden Considerations

Procore integration will generate support requests:

- Connection troubleshooting
- Sync failure diagnosis
- Data mapping questions
- "Why doesn't it do X?"

**Mitigation:**
- Self-service diagnostics in admin UI
- Comprehensive help documentation
- Clear error messages that guide users
- Consider dedicated integration support tier

### 9.4 Long-Term Sustainability

The integration is sustainable if:

- Maintenance cost is covered by revenue (direct or indirect)
- Procore partnership (if any) is mutually beneficial
- Integration team has clear ownership and roadmap
- API changes are manageable without heroic effort

**Warning Sign:** If integration becomes "everyone's problem and no one's responsibility," sustainability is at risk. Clear ownership is essential.

### 9.5 Explicit Scope Note

**Pricing, packaging, and commercial terms are out of scope for this document.** However, architectural decisions should be made with awareness that:

- Integrations have ongoing costs
- Customer expectations scale with investment
- Free integrations often become under-maintained

This document provides the technical and product foundation; commercial decisions follow separately.

---

## Appendix A: Procore API Reference (For Planning)

*This section to be populated during Phase 0 research with specific endpoint information, rate limits, and data models.*

### Expected Endpoints

- `GET /projects` — List projects
- `GET /projects/{id}/change_events` — List change events
- `POST /projects/{id}/change_order_packages` — Create PCO
- `POST /projects/{id}/time_and_material_entries` — Create T&M
- `POST /projects/{id}/images` — Upload photo

### Known Considerations

- OAuth 2.0 with refresh tokens
- Rate limits vary by endpoint and plan
- Some endpoints are module-dependent (T&M, Change Management)
- Webhook support for real-time notifications (to be validated)

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **COR** | Change Order Request — FieldSync's change order document |
| **PCO** | Potential Change Order — Procore's equivalent to COR |
| **CE** | Change Event — Procore's container for potential changes |
| **T&M** | Time & Materials — Labor and materials ticket |
| **OAuth** | Open Authorization — Authentication protocol for API access |
| **System of Record** | The authoritative source for a given data type |
| **Tenant** | A FieldSync customer company (multi-tenant SaaS) |

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2024-12-30 | Principal Architect | Initial draft |

---

*End of Document*
