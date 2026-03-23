# FieldSync Profitability Forecast

**Date:** March 2026
**Scope:** 3-year realistic profitability analysis (2026–2028)

---

## Executive Summary

FieldSync is a construction field-to-office sync platform targeting small-to-mid-size contractors. The product is technically mature (core features complete, offline support, real-time sync) but **pre-revenue** — Stripe billing is not yet implemented and there are zero paying customers today.

**Bottom line:** FieldSync can reach profitability by **Month 14–18** under realistic assumptions, generating **$30K–$55K MRR** by end of Year 2. However, this depends heavily on completing payment infrastructure, acquiring early customers through direct sales, and keeping the team lean.

---

## 1. Pricing Structure (As Planned)

| Tier | Monthly | Annual | Target Segment |
|------|---------|--------|----------------|
| **Free Trial** | $0 (14 days) | — | Evaluation |
| **Pro** | $49/mo | $490/yr (~$41/mo) | 1–5 person crews, small subs |
| **Business** | $149/mo | $1,490/yr (~$124/mo) | Growing GCs, 5–20 users |
| **Enterprise** | $499/mo (est.) | Custom | Large contractors, white-label |

**Blended ARPU estimate:** $95/mo (weighted toward Pro-heavy early mix)

### Pricing Reality Check

- **$49/mo Pro** is competitive. Construction SaaS tools like Fieldwire ($39–$59/user/mo), Raken ($15/user/day), and Procore ($375+/mo) set the range. FieldSync's per-company (not per-user) pricing is a differentiator.
- **$149/mo Business** is reasonable for 10–20 user companies getting white-labeling.
- **Enterprise** pricing is speculative until first enterprise deal closes.

---

## 2. Cost Structure

### Fixed Monthly Costs

| Cost Item | Current | At 50 Customers | At 200 Customers | At 500 Customers |
|-----------|---------|-----------------|-------------------|-------------------|
| **Supabase** (DB, Auth, Realtime, Storage) | $25 (free tier) | $75 (Pro) | $150 (Pro+overages) | $400 (Team) |
| **Vercel** (Hosting) | $0 (Hobby) | $20 (Pro) | $20 | $50 (Pro+bandwidth) |
| **Domain & DNS** | $15/yr | $15/yr | $15/yr | $15/yr |
| **Monitoring** (Sentry, analytics) | $0 | $29 | $29 | $79 |
| **Email** (Resend) | $0 (3K free) | $0 | $20 | $40 |
| **Stripe fees** (2.9% + $0.30) | $0 | ~$150 | ~$600 | ~$1,500 |
| **Total Infrastructure** | **~$27/mo** | **~$275/mo** | **~$820/mo** | **~$2,070/mo** |

### Gross Margin by Scale

| Customers | MRR | Infra Cost | Gross Margin |
|-----------|-----|------------|-------------|
| 50 | $4,750 | $275 | 94% |
| 200 | $19,000 | $820 | 96% |
| 500 | $47,500 | $2,070 | 96% |

Infrastructure costs are negligible — this is a high-margin SaaS. **The real costs are people and customer acquisition.**

### Team / Labor Costs (The Real Expense)

| Scenario | Team | Monthly Burn |
|----------|------|-------------|
| **Solo founder** | 1 dev/founder, no salary drawn | $0 (sweat equity) |
| **Lean startup** | 1 founder + 1 part-time contractor | $3,000–$5,000/mo |
| **Small team** | 1 founder + 1 dev + 1 sales | $15,000–$25,000/mo |
| **Growth mode** | 2 devs + 1 sales + 1 support | $30,000–$50,000/mo |

---

## 3. Customer Acquisition Assumptions

### Construction SaaS Market Context

- US construction industry: ~750,000 contractor firms
- Addressable market (specialty + small GCs with 5–100 employees): ~150,000 firms
- SaaS adoption in construction is **growing but lagging** — many firms still use spreadsheets/paper
- Typical construction SaaS conversion: 2–5% trial-to-paid, 5–10% monthly churn for SMBs

### Realistic Acquisition Channels

| Channel | CAC Estimate | Monthly Leads | Conversion | Customers/Mo |
|---------|-------------|---------------|------------|--------------|
| **Direct outreach** (LinkedIn, trade shows) | $200–$500 | 20–50 | 10–15% | 2–7 |
| **Word of mouth / referral** | $0–$50 | 5–15 | 20–30% | 1–4 |
| **Content marketing / SEO** | $100–$300 | 10–30 | 3–5% | 0–1 |
| **Procore marketplace** (post-integration) | $50–$150 | 10–20 | 8–12% | 1–2 |
| **Construction associations / partnerships** | $100–$200 | 5–10 | 10–15% | 1–2 |

**Realistic new customer growth:** 5–10/month in Year 1, 10–20/month in Year 2, 15–30/month in Year 3.

### Churn Assumptions

- **Monthly logo churn:** 5–8% (construction SMB typical)
- **Revenue churn:** 3–5% (larger accounts stick longer)
- **Net revenue retention:** 95–105% (expansion from Pro → Business upgrades)

---

## 4. Three Scenarios — 36-Month Forecast

### Scenario A: Conservative (Solo/Lean)

*Assumptions: Solo founder, minimal marketing spend, slow organic growth*

| Month | New Custs | Churned | Active | MRR | Monthly Costs | Net |
|-------|-----------|---------|--------|-----|---------------|-----|
| 1–3 | 2/mo | 0 | 6 | $570 | $200 | +$370 |
| 6 | 3/mo | 1 | 15 | $1,425 | $300 | +$1,125 |
| 12 | 5/mo | 2 | 38 | $3,610 | $500 | +$3,110 |
| 18 | 7/mo | 3 | 65 | $6,175 | $800 | +$5,375 |
| 24 | 8/mo | 4 | 95 | $9,025 | $1,200 | +$7,825 |
| 36 | 10/mo | 6 | 155 | $14,725 | $2,000 | +$12,725 |

- **Breakeven:** Immediate (no labor costs beyond sweat equity)
- **Year 1 Revenue:** ~$22K | **Year 2:** ~$72K | **Year 3:** ~$145K
- **Cumulative 3-Year Revenue:** ~$239K
- **Reality check:** This is a lifestyle business. Sustainable but slow.

### Scenario B: Moderate (Small Team)

*Assumptions: Founder + 1 contractor + part-time sales, moderate marketing*

| Month | New Custs | Churned | Active | MRR | Monthly Costs | Net |
|-------|-----------|---------|--------|-----|---------------|-----|
| 1–3 | 4/mo | 0 | 12 | $1,140 | $5,500 | -$4,360 |
| 6 | 8/mo | 2 | 30 | $2,850 | $6,000 | -$3,150 |
| 12 | 12/mo | 4 | 72 | $6,840 | $7,000 | -$160 |
| 18 | 15/mo | 5 | 120 | $11,400 | $8,500 | +$2,900 |
| 24 | 18/mo | 7 | 180 | $17,100 | $10,000 | +$7,100 |
| 36 | 22/mo | 10 | 300 | $28,500 | $14,000 | +$14,500 |

- **Breakeven:** ~Month 12–14
- **Year 1 Revenue:** ~$44K | **Year 2:** ~$155K | **Year 3:** ~$310K
- **Cumulative 3-Year Revenue:** ~$509K
- **Cumulative 3-Year Costs:** ~$324K
- **3-Year Profit:** ~$185K
- **Pre-breakeven cash needed:** ~$45K–$55K

### Scenario C: Growth (Funded/Aggressive)

*Assumptions: Seed funding, 4-person team, paid acquisition, Procore integration live*

| Month | New Custs | Churned | Active | MRR | Monthly Costs | Net |
|-------|-----------|---------|--------|-----|---------------|-----|
| 1–3 | 8/mo | 0 | 24 | $2,520 | $35,000 | -$32,480 |
| 6 | 15/mo | 3 | 60 | $6,300 | $38,000 | -$31,700 |
| 12 | 25/mo | 6 | 145 | $15,225 | $42,000 | -$26,775 |
| 18 | 35/mo | 8 | 260 | $27,300 | $48,000 | -$20,700 |
| 24 | 40/mo | 12 | 400 | $42,000 | $52,000 | -$10,000 |
| 30 | 45/mo | 15 | 520 | $54,600 | $55,000 | -$400 |
| 36 | 50/mo | 18 | 650 | $68,250 | $58,000 | +$10,250 |

- **Breakeven:** ~Month 30
- **Year 1 Revenue:** ~$95K | **Year 2:** ~$350K | **Year 3:** ~$710K
- **Cumulative 3-Year Revenue:** ~$1.15M
- **Pre-breakeven cash needed:** ~$550K–$700K (seed round)
- **ARR at Month 36:** ~$819K

---

## 5. Key Risks & Sensitivity Analysis

### Critical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Churn > 8%/mo** | Kills growth; net customer count stalls | Medium | Onboarding support, feature stickiness (billing integration) |
| **Procore integration delays** | Lose key acquisition channel | Medium | Can launch without it; direct sales compensate |
| **Scaling bottlenecks** (documented) | Customer complaints at 50+ companies | High | Address Phase 1 scaling before hitting 50 customers |
| **Competition** (Fieldwire, Raken, Procore native) | Price pressure, feature gaps | Medium | Focus on field-first simplicity + billing tie-in |
| **Solo founder burnout** | Product stalls | High (if solo) | Hire contractor or co-founder early |
| **Construction downturn** | Slower adoption | Low-Medium | Counter-cyclical: tighter margins → more need for billing accuracy |

### Sensitivity: What Moves the Needle Most

| Variable | +20% Impact on Year 2 Revenue | -20% Impact |
|----------|-------------------------------|-------------|
| **New customer growth rate** | +$31K | -$31K |
| **Monthly churn** | -$18K (lower churn = more) | +$18K |
| **ARPU (pricing)** | +$31K | -$31K |
| **Conversion rate** | +$15K | -$15K |

**Churn is the most dangerous variable.** At 10%+ monthly churn, even aggressive acquisition can't build a sustainable base. At 3% churn, the business compounds rapidly.

---

## 6. Prerequisites Before Revenue Can Start

These must be completed before any revenue is possible:

| Prerequisite | Effort | Status |
|--------------|--------|--------|
| **Stripe integration** (subscriptions, billing portal) | 2–4 weeks | Planning doc exists, not started |
| **Backend subscription enforcement** (RLS-based) | 1–2 weeks | Frontend-only gating exists |
| **Trial-to-paid flow** (upgrade prompts, feature gates) | 1–2 weeks | Partially built (branding gates) |
| **Onboarding flow** (first project setup wizard) | 1 week | Not started |
| **Terms of Service / Privacy Policy** | 1 week | Not started |
| **Landing page with pricing** | 3–5 days | Landing page exists, no pricing page |

**Minimum time to first dollar: 4–6 weeks of focused development.**

---

## 7. Unit Economics

| Metric | Value | Benchmark |
|--------|-------|-----------|
| **ARPU** | $95/mo (blended) | Good for SMB SaaS |
| **CAC** (direct sales) | $200–$500 | Acceptable |
| **LTV** (at 5% churn) | $1,900 | — |
| **LTV** (at 3% churn) | $3,167 | — |
| **LTV:CAC ratio** (at 5% churn) | 3.8–9.5x | Healthy (>3x is good) |
| **Payback period** | 2–5 months | Excellent (<12mo is good) |
| **Gross margin** | 94–96% | Outstanding (SaaS avg: 70–80%) |

---

## 8. Realistic Verdict

### Most Likely Outcome (Scenario B — Moderate)

| Milestone | Timeline |
|-----------|----------|
| First paying customer | Month 2–3 (after Stripe launch) |
| 10 paying customers | Month 5–6 |
| $5K MRR | Month 10–12 |
| Breakeven (covers team costs) | Month 12–14 |
| $10K MRR | Month 16–18 |
| 100 customers | Month 15–18 |
| $25K MRR | Month 28–32 |

### What Makes FieldSync Viable

1. **High gross margins (95%+)** — Supabase/Vercel costs are negligible
2. **Per-company pricing** — Simpler than per-seat, attractive to buyers
3. **Construction is underserved** — Many firms still on paper/spreadsheets
4. **Sticky once adopted** — Billing data creates lock-in
5. **No-app field access** — PIN login removes adoption friction for crews
6. **Offline works** — Critical for construction sites with poor connectivity

### What Could Kill It

1. **Never shipping Stripe** — Can't make money without billing
2. **Churn > 8%** — SMB churn is the #1 killer of vertical SaaS
3. **Scaling debt** — The documented 9-query-per-project dashboard will break at 50+ companies
4. **Solo execution** — One person building, selling, and supporting is unsustainable past ~30 customers

### Recommendation

**Ship Stripe integration immediately.** Every week without billing is a week of zero revenue on a product that's already feature-complete enough to sell. The forecast shows a viable business at $95/mo ARPU with even modest growth — but the clock starts when the first invoice goes out, not before.
