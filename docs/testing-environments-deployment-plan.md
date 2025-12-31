# Testing, Environments, and Deployment Strategy

**Document Type:** Planning & Analysis (No Implementation)
**Author:** Principal Software Architect
**Date:** December 30, 2024
**Status:** Draft for Review

---

## Executive Summary

FieldSync currently operates with **zero automated tests**, a **single production environment**, and **manual deployment via Vercel**. While this approach enabled rapid development, it introduces significant risk as the application scales. This document analyzes the current state, identifies gaps, and proposes a phased approach to improve reliability without disrupting ongoing development.

---

## Phase 1: Current State Mapping

### 1.1 Testing — Current Reality

| Aspect | Status |
|--------|--------|
| Unit Tests | **None** |
| Integration Tests | **None** |
| End-to-End Tests | **None** |
| Test Framework | Not installed |
| Test Scripts | None in package.json |
| CI Test Pipeline | Does not exist |

**Critical Unprotected Workflows:**

| Workflow | Risk Level | Impact if Broken |
|----------|------------|------------------|
| **Auth & User Access** | Critical | Users locked out, data exposure |
| PIN-based field authentication | Critical | Field crews can't work |
| Email/password office authentication | Critical | Office can't manage projects |
| **Multi-Tenant Behavior** | Critical | Data leakage between companies |
| Company isolation in queries | Critical | Competitor data exposure |
| RLS policy enforcement | Critical | Unauthorized access |
| **COR ↔ T&M Workflows** | High | Billing errors, lost revenue |
| Ticket-COR linking | High | CORs missing backup documentation |
| COR total calculations | High | Incorrect billing amounts |
| Status transitions | Medium | Workflow confusion |
| **File Uploads (Photos)** | Medium | Evidence not captured |
| Image compression | Low | Large file sizes |
| Storage bucket access | Medium | Upload failures |
| **Role/Permission Logic** | High | Unauthorized actions |
| Office vs Field access | High | Feature exposure |
| Admin vs User capabilities | High | Dangerous operations exposed |

### 1.2 Environments — Current Reality

| Environment | Exists? | Details |
|-------------|---------|---------|
| **Local Development** | Yes | `npm run dev` → localhost:5173 |
| **Development/Test** | **No** | Does not exist |
| **Staging** | **No** | Does not exist |
| **Production** | Yes | Vercel deployment |

**Environment Configuration:**

```
.env                 → Production credentials (local copy)
.env.example         → Template with placeholder values
vercel.json          → SPA routing configuration only
```

**Current Environment Variables:**
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

**Critical Observation:** Local development connects directly to the **production Supabase database**. There is no isolated development database.

### 1.3 Deployment Process — Current Reality

**Current Flow:**
```
Developer → git push → GitHub → Vercel Auto-Deploy → Production
```

| Aspect | Current State |
|--------|---------------|
| **Trigger** | Any push to `main` branch |
| **Build** | Vite production build |
| **Tests Before Deploy** | None |
| **Preview Deployments** | Vercel provides per-PR previews |
| **Rollback Capability** | Manual via Vercel dashboard |
| **Deploy Failure Handling** | Vercel shows error, previous version remains |
| **Database Migrations** | Manual SQL execution in Supabase dashboard |
| **Migration Rollback** | No automated rollback capability |

**Database Migration Process:**
1. Developer writes SQL file in `supabase/migrations/`
2. Developer manually runs SQL in Supabase SQL Editor
3. No version tracking beyond file naming convention
4. No rollback scripts exist
5. Migrations run against production directly

---

## Phase 2: Risk & Gap Analysis

### 2.1 Risk Matrix

| Risk | Likelihood | Impact | Score | Description |
|------|------------|--------|-------|-------------|
| **Production as test environment** | High | High | **Critical** | All testing happens on live data |
| **RLS policy regression** | Medium | Critical | **Critical** | One bad policy = data breach |
| **Multi-tenant data leak** | Low | Critical | **High** | Company A sees Company B data |
| **COR calculation error** | Medium | High | **High** | Incorrect billing amounts |
| **Migration breaks production** | Medium | High | **High** | No way to test migrations first |
| **Field auth bypass** | Low | High | **Medium** | Unauthorized project access |
| **Photo upload failure** | Medium | Medium | **Medium** | Evidence not captured |
| **Deploy introduces bug** | High | Medium | **Medium** | No tests catch regressions |
| **Cannot rollback migration** | Medium | Medium | **Medium** | Stuck with broken schema |

### 2.2 Key Gaps Identified

**Gap 1: No Test Database**
- Local dev uses production Supabase
- Migrations tested directly in production
- Cannot safely test destructive operations

**Gap 2: No Automated Testing**
- 5,373 lines in supabase.js alone
- 46 React components
- All changes verified manually
- Regressions discovered by users

**Gap 3: No Pre-Deploy Validation**
- Code goes straight to production
- No smoke tests after deploy
- Rollback is manual and slow

**Gap 4: No Migration Safety**
- Migrations run manually
- No dry-run capability
- No rollback scripts
- No staging environment to test

**Gap 5: Single Point of Failure**
- One Supabase project
- One Vercel deployment
- Developer error = production impact

### 2.3 Areas Where Production Acts as Test Environment

| Activity | Currently Done In Production |
|----------|------------------------------|
| New feature testing | Yes |
| Bug reproduction | Yes |
| Migration validation | Yes |
| RLS policy testing | Yes |
| Performance testing | Yes |
| Edge case exploration | Yes |

---

## Phase 3: Future-State Options (Conceptual)

### 3.1 Testing Strategy Options

**Option A: Critical Path Testing Only**
- Focus: Auth, RLS, COR calculations
- Effort: Low-Medium
- Coverage: ~20% of codebase
- Benefit: Protects highest-risk areas

**Option B: Comprehensive Unit + Integration Testing**
- Focus: All database operations + business logic
- Effort: High
- Coverage: ~60-70% of codebase
- Benefit: High confidence in changes

**Option C: E2E Testing Focus**
- Focus: User workflows via browser automation
- Effort: Medium-High
- Coverage: User-facing flows only
- Benefit: Catches integration issues

**Recommendation:** Start with **Option A**, evolve toward hybrid of A+C.

**Suggested Test Priority Order:**
1. RLS policy validation (prevent data leaks)
2. Multi-tenant isolation (company separation)
3. COR calculations (billing accuracy)
4. Auth flows (access control)
5. Ticket-COR linking (data integrity)
6. Critical UI workflows (E2E)

### 3.2 Environment Strategy Options

**Option A: Supabase Branching (Recommended for Start)**
- Use Supabase's built-in database branching
- Creates isolated copy for testing
- Syncs schema from production
- Cost: Included in Pro plan
- Complexity: Low

**Option B: Separate Supabase Project**
- Create `fieldsync-staging` project
- Full isolation from production
- Requires manual schema sync
- Cost: Additional project cost
- Complexity: Medium

**Option C: Local Supabase (Docker)**
- Run Supabase locally via Docker
- Full isolation, zero cost
- Requires Docker setup
- Schema sync is manual
- Complexity: Medium-High

**Recommendation:** Start with **Option A** (branching), consider **Option B** as usage grows.

**Environment Comparison:**

| Factor | Branching | Separate Project | Local Docker |
|--------|-----------|------------------|--------------|
| Cost | Included (Pro) | ~$25/mo | Free |
| Setup Effort | Low | Medium | Medium-High |
| Data Isolation | Full | Full | Full |
| Schema Sync | Automatic | Manual | Manual |
| Realistic Data | Copy from prod | Seed scripts | Seed scripts |
| CI Integration | Easy | Easy | Requires Docker in CI |

### 3.3 Deployment Safety Options

**Option A: Branch-Based Preview Environments**
- Vercel already provides per-PR previews
- Connect previews to Supabase branches
- Test before merging to main
- Complexity: Low
- Benefit: Catch issues before production

**Option B: Blue-Green Deployment**
- Maintain two production environments
- Switch traffic after validation
- Instant rollback capability
- Complexity: High (requires custom setup)
- Benefit: Zero-downtime, instant rollback

**Option C: Feature Flags**
- Deploy code but disable features
- Gradually enable for users
- Roll back by disabling flag
- Complexity: Medium
- Benefit: Granular control

**Option D: Canary Releases**
- Deploy to subset of users first
- Monitor for issues
- Roll out or roll back
- Complexity: High
- Benefit: Limited blast radius

**Recommendation:** Start with **Option A** (already partially available), add **Option C** for high-risk features.

**Blue-Green Feasibility Analysis:**

| Factor | Assessment |
|--------|------------|
| Vercel Support | Not native, requires workarounds |
| Database Challenge | Both environments share Supabase |
| Complexity | High for current team size |
| Benefit vs Cost | Low ROI at current scale |
| Verdict | **Not recommended currently** |

---

## Phase 4: Phased Planning Roadmap

### Phase 0: Observability & Visibility
**Timeline:** Immediate (1-2 weeks)
**Effort:** Low

**Goals:**
- Know when things break before users report
- Understand current error rates
- Baseline performance metrics

**Deliverables:**
- [ ] Error tracking integration (Sentry or similar)
- [ ] Basic uptime monitoring
- [ ] Database query performance baseline
- [ ] Document current error patterns

**Expected Benefits:**
- Faster incident response
- Data-driven prioritization
- Visibility into production health

**Risks:**
- Tool integration overhead
- Alert fatigue if not tuned

---

### Phase 1: Testing Foundations
**Timeline:** 2-4 weeks
**Effort:** Medium

**Goals:**
- Protect critical paths with tests
- Establish testing patterns for team
- Catch regressions before deploy

**Deliverables:**
- [ ] Test framework installed (Vitest recommended)
- [ ] RLS policy test suite
- [ ] COR calculation tests
- [ ] Auth flow tests
- [ ] CI pipeline runs tests on PR

**Suggested Test Structure:**
```
tests/
├── unit/
│   ├── calculations.test.js   # COR math
│   └── utils.test.js          # Utility functions
├── integration/
│   ├── rls-policies.test.js   # Database security
│   ├── multi-tenant.test.js   # Company isolation
│   └── cor-workflow.test.js   # End-to-end COR flow
└── setup/
    ├── test-db.js             # Test database setup
    └── fixtures.js            # Test data
```

**Expected Benefits:**
- 80% reduction in critical regressions
- Faster, safer code reviews
- Developer confidence

**Risks:**
- Initial slowdown for test writing
- Test maintenance burden
- False sense of security if tests are weak

---

### Phase 2: Environment Separation
**Timeline:** 2-3 weeks
**Effort:** Medium

**Goals:**
- Stop testing in production
- Safe place for migration testing
- Realistic staging environment

**Deliverables:**
- [ ] Supabase branching or staging project
- [ ] Environment variable management documented
- [ ] Seed script for test data
- [ ] Migration testing process defined
- [ ] Vercel preview → Supabase branch connection

**Environment Configuration:**
```
Production:  VITE_SUPABASE_URL=https://xxx.supabase.co
Staging:     VITE_SUPABASE_URL=https://xxx-staging.supabase.co
Local:       VITE_SUPABASE_URL=https://xxx-dev.supabase.co (or branch)
```

**Expected Benefits:**
- Zero production incidents from testing
- Migrations validated before production
- Realistic performance testing

**Risks:**
- Data drift between environments
- Additional cost (if separate project)
- Complexity managing multiple environments

---

### Phase 3: Deployment Safety Improvements
**Timeline:** 2-4 weeks
**Effort:** Medium-High

**Goals:**
- Reduce blast radius of bad deploys
- Enable instant rollback
- Validate deployments automatically

**Deliverables:**
- [ ] Post-deploy smoke test suite
- [ ] Deployment checklist documented
- [ ] Rollback procedure documented and tested
- [ ] Consider feature flags for major features
- [ ] Database migration rollback scripts

**Deployment Checklist (Example):**
```
Pre-Deploy:
□ All tests passing
□ Migration tested in staging
□ PR reviewed and approved

Post-Deploy:
□ Smoke test: Can log in
□ Smoke test: Can create ticket
□ Smoke test: COR loads
□ Check error monitoring
□ Verify no RLS errors in logs
```

**Expected Benefits:**
- Faster incident recovery
- Reduced deploy anxiety
- Documented procedures for team

**Risks:**
- Over-engineering for current scale
- Process overhead slows velocity
- Feature flags add complexity

---

## Summary Tables

### Current State Summary

| Area | Status | Risk Level |
|------|--------|------------|
| Automated Tests | None | Critical |
| Development Environment | Uses production DB | Critical |
| Staging Environment | None | High |
| CI/CD Pipeline | Basic (no tests) | Medium |
| Rollback Capability | Manual, slow | Medium |
| Migration Process | Manual, no staging | High |
| Monitoring | Basic/None | High |

### Risk Assessment Summary

| Risk | Current Mitigation | Recommended Action |
|------|-------------------|-------------------|
| Data leak between tenants | RLS policies | Add RLS policy tests |
| COR billing errors | Manual review | Add calculation tests |
| Production as test env | None | Create staging environment |
| Migration breaks prod | None | Test migrations in staging |
| Deploy introduces bug | Manual testing | Add automated tests + CI |
| Cannot recover from failure | Manual Vercel rollback | Document + test rollback |

### Future State Vision

| Area | Current | Short-Term (3 mo) | Long-Term (6+ mo) |
|------|---------|-------------------|-------------------|
| Test Coverage | 0% | 20-30% critical paths | 50-60% |
| Environments | 1 (prod) | 2 (prod + staging) | 3 (prod + staging + dev) |
| Deploy Confidence | Low | Medium | High |
| Rollback Time | 10-30 min | 5 min | <1 min |
| Migration Safety | Low | Medium | High |

---

## Open Questions & Assumptions

### Open Questions

1. **Budget:** What's the budget for additional Supabase projects or tooling?
2. **Team Size:** Will there be additional developers? (affects process overhead)
3. **Compliance:** Are there industry requirements (SOC2, etc.) driving timeline?
4. **Downtime Tolerance:** What's acceptable downtime during deploys/issues?
5. **Data Sensitivity:** How sensitive is the data? (affects security testing priority)

### Assumptions Made

1. Current Supabase plan supports branching or budget exists for staging project
2. Vercel free tier is sufficient (or Pro is available)
3. Team can allocate time for testing without stopping feature development
4. No immediate compliance requirements forcing accelerated timeline
5. Current deployment frequency is sustainable (no need for continuous deployment)

---

## Success Criteria

This plan succeeds if it:

- [x] Clarifies the current state accurately
- [x] Identifies specific, actionable risks
- [x] Provides realistic, phased options
- [x] Enables informed decision-making
- [x] Avoids over-engineering for current scale
- [ ] Gets stakeholder buy-in (pending review)
- [ ] Leads to measurable improvements (pending implementation)

---

## Next Steps (Decision Points)

1. **Review this document** with stakeholders
2. **Decide on Phase 0** - Which monitoring tool?
3. **Decide on Phase 1** - Vitest? What to test first?
4. **Decide on Phase 2** - Branching vs separate project?
5. **Prioritize** - Which phase is most urgent?

---

*This document is for planning purposes only. No implementation should occur until decisions are made on the options presented.*
