# FieldSync Subscription & Billing Implementation Plan

## Executive Summary

This document outlines a complete subscription billing system for FieldSync using Stripe as the payment processor. The design prioritizes:

1. **Legal compliance** - PCI DSS via Stripe, clear terms, proper tax handling
2. **Non-breaking changes** - Additive schema changes, backwards compatibility
3. **Existing architecture alignment** - Follows current RLS patterns, code conventions

---

## Current State Analysis

### What Already Exists

| Component | Status | Notes |
|-----------|--------|-------|
| `subscription_tier` column | ✅ Exists | On `companies` table, values: 'free', 'pro', 'business', 'enterprise' |
| Feature gating pattern | ✅ Exists | `BrandingSettings.jsx` shows the pattern |
| RLS policies | ✅ Exists | Company membership checks throughout |
| Project invoices | ✅ Exists | `invoices` table for COR/T&M billing (NOT subscription billing) |
| Stripe integration | ❌ Missing | No payment processing code |
| Backend enforcement | ❌ Missing | Tier checks are frontend-only |

### What Won't Be Touched (Safety Guarantee)

These existing tables/functions will NOT be modified:
- `users` table structure
- `user_companies` table structure
- `projects`, `areas`, `change_orders` tables
- `invoices` table (for project billing)
- All existing RLS policies
- All existing RPC functions

---

## Proposed Plan Structure

### Tier Definitions

| Tier | Price | Billing | Target Customer |
|------|-------|---------|-----------------|
| **Free Trial** | $0 | 14 days | New signups |
| **Pro** | $49/mo or $490/yr | Monthly/Annual | Small contractors (1-5 users) |
| **Business** | $149/mo or $1,490/yr | Monthly/Annual | Growing companies (6-20 users) |
| **Enterprise** | Custom | Annual | Large contractors (20+ users) |

### Feature Matrix

| Feature | Free Trial | Pro | Business | Enterprise |
|---------|------------|-----|----------|------------|
| Projects | 3 | 10 | Unlimited | Unlimited |
| Team members | 3 | 5 | 20 | Unlimited |
| Storage | 1 GB | 10 GB | 50 GB | Unlimited |
| T&M Tickets | ✅ | ✅ | ✅ | ✅ |
| COR Management | ✅ | ✅ | ✅ | ✅ |
| Daily Reports | ✅ | ✅ | ✅ | ✅ |
| Progress Billing | ❌ | ✅ | ✅ | ✅ |
| Custom Logo | ❌ | ✅ | ✅ | ✅ |
| White Labeling | ❌ | ❌ | ✅ | ✅ |
| Custom Domain | ❌ | ❌ | ❌ | ✅ |
| API Access | ❌ | ❌ | ✅ | ✅ |
| Priority Support | ❌ | Email | Email+Chat | Dedicated |
| Data Export | CSV | CSV | CSV+Excel | All formats |
| Audit Logs | ❌ | ❌ | 30 days | 1 year |

---

## Database Schema Changes

### New Tables (Additive - No Existing Table Changes)

```sql
-- ============================================
-- 1. SUBSCRIPTION PLANS (Reference Data)
-- ============================================
CREATE TABLE subscription_plans (
  id TEXT PRIMARY KEY, -- 'pro_monthly', 'pro_annual', 'business_monthly', etc.
  tier TEXT NOT NULL CHECK (tier IN ('free', 'pro', 'business', 'enterprise')),
  name TEXT NOT NULL,
  description TEXT,

  -- Pricing (in cents)
  price_cents INTEGER NOT NULL,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),

  -- Stripe IDs (populated after creating products in Stripe)
  stripe_product_id TEXT,
  stripe_price_id TEXT,

  -- Limits
  max_projects INTEGER,
  max_users INTEGER,
  max_storage_bytes BIGINT,

  -- Feature flags
  features JSONB DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. COMPANY SUBSCRIPTIONS (Active Subscriptions)
-- ============================================
CREATE TABLE company_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),

  -- Stripe references
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,

  -- Status
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN (
    'trialing',      -- In free trial
    'active',        -- Paid and current
    'past_due',      -- Payment failed, in grace period
    'canceled',      -- Subscription canceled (still active until period end)
    'unpaid',        -- Grace period expired
    'paused'         -- Temporarily paused
  )),

  -- Dates
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,

  -- Billing
  billing_email TEXT,
  billing_name TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id) -- One active subscription per company
);

-- ============================================
-- 3. SUBSCRIPTION EVENTS (Audit Log)
-- ============================================
CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES company_subscriptions(id) ON DELETE SET NULL,

  -- Event details
  event_type TEXT NOT NULL, -- 'created', 'upgraded', 'downgraded', 'canceled', 'payment_failed', 'payment_succeeded', 'trial_ended'
  from_plan_id TEXT,
  to_plan_id TEXT,

  -- Stripe reference
  stripe_event_id TEXT UNIQUE,

  -- Additional data
  metadata JSONB DEFAULT '{}',

  -- Who triggered (null if automated/webhook)
  triggered_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. PAYMENT METHODS (Cached from Stripe)
-- ============================================
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT NOT NULL UNIQUE,

  -- Card details (non-sensitive, from Stripe)
  card_brand TEXT, -- 'visa', 'mastercard', etc.
  card_last4 TEXT,
  card_exp_month INTEGER,
  card_exp_year INTEGER,

  -- Status
  is_default BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. SUBSCRIPTION INVOICES (From Stripe)
-- ============================================
CREATE TABLE subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES company_subscriptions(id) ON DELETE SET NULL,

  -- Stripe reference
  stripe_invoice_id TEXT UNIQUE,
  stripe_invoice_number TEXT,
  stripe_hosted_invoice_url TEXT,
  stripe_pdf_url TEXT,

  -- Amounts (in cents)
  subtotal INTEGER NOT NULL,
  tax INTEGER DEFAULT 0,
  total INTEGER NOT NULL,
  amount_paid INTEGER DEFAULT 0,
  amount_due INTEGER NOT NULL,

  -- Status
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),

  -- Dates
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_company_subscriptions_company ON company_subscriptions(company_id);
CREATE INDEX idx_company_subscriptions_status ON company_subscriptions(status);
CREATE INDEX idx_company_subscriptions_stripe ON company_subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscription_events_company ON subscription_events(company_id);
CREATE INDEX idx_subscription_events_type ON subscription_events(event_type);
CREATE INDEX idx_subscription_invoices_company ON subscription_invoices(company_id);
CREATE INDEX idx_subscription_invoices_status ON subscription_invoices(status);
CREATE INDEX idx_payment_methods_company ON payment_methods(company_id);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;

-- Plans are readable by all authenticated users
CREATE POLICY "Anyone can view active plans" ON subscription_plans
  FOR SELECT USING (is_active = true);

-- Subscriptions visible to company members
CREATE POLICY "Company members view subscription" ON company_subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = company_subscriptions.company_id
      AND uc.status = 'active'
    )
  );

-- Only admins can modify subscriptions
CREATE POLICY "Admins manage subscription" ON company_subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = company_subscriptions.company_id
      AND uc.status = 'active'
      AND uc.role IN ('admin', 'owner')
    )
  );

-- Events visible to company members
CREATE POLICY "Company members view events" ON subscription_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = subscription_events.company_id
      AND uc.status = 'active'
    )
  );

-- Payment methods visible to admins only
CREATE POLICY "Admins view payment methods" ON payment_methods
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = payment_methods.company_id
      AND uc.status = 'active'
      AND uc.role IN ('admin', 'owner')
    )
  );

-- Invoices visible to admins
CREATE POLICY "Admins view invoices" ON subscription_invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = subscription_invoices.company_id
      AND uc.status = 'active'
      AND uc.role IN ('admin', 'owner')
    )
  );
```

### Column Additions to Existing Tables (Non-Breaking)

```sql
-- Add Stripe customer ID to companies (nullable, additive)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- Add usage tracking columns (nullable, additive)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_project_count INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_user_count INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_storage_bytes BIGINT DEFAULT 0;
```

---

## Stripe Integration Architecture

### Why Stripe Handles Legal/Compliance

1. **PCI DSS Compliance**: Card data never touches our servers - Stripe Elements handles all sensitive input
2. **Tax Handling**: Stripe Tax can calculate and collect sales tax automatically
3. **Receipts**: Stripe sends compliant receipts/invoices automatically
4. **Disputes**: Stripe handles chargebacks and disputes
5. **International**: Supports 135+ currencies, handles currency conversion

### Stripe Product Setup

```javascript
// Create in Stripe Dashboard or via API:
const products = [
  {
    name: 'FieldSync Pro',
    metadata: { tier: 'pro' },
    prices: [
      { unit_amount: 4900, currency: 'usd', recurring: { interval: 'month' } },
      { unit_amount: 49000, currency: 'usd', recurring: { interval: 'year' } }
    ]
  },
  {
    name: 'FieldSync Business',
    metadata: { tier: 'business' },
    prices: [
      { unit_amount: 14900, currency: 'usd', recurring: { interval: 'month' } },
      { unit_amount: 149000, currency: 'usd', recurring: { interval: 'year' } }
    ]
  }
]
```

### Webhook Events to Handle

| Event | Action |
|-------|--------|
| `customer.subscription.created` | Create `company_subscriptions` record |
| `customer.subscription.updated` | Update status, dates, plan |
| `customer.subscription.deleted` | Mark subscription as canceled |
| `invoice.payment_succeeded` | Update subscription status to 'active' |
| `invoice.payment_failed` | Update status to 'past_due', send notification |
| `customer.subscription.trial_will_end` | Send trial ending notification (3 days before) |

### Supabase Edge Function for Webhooks

```typescript
// supabase/functions/stripe-webhook/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@13.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')!
  const body = await req.text()

  // Verify webhook signature (CRITICAL for security)
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    )
  } catch (err) {
    return new Response('Webhook signature verification failed', { status: 400 })
  }

  // Handle events...
  switch (event.type) {
    case 'customer.subscription.updated':
      await handleSubscriptionUpdate(event.data.object)
      break
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object)
      break
    // ... other handlers
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})
```

---

## Frontend Integration

### New Components

```
src/components/billing/
├── PricingPage.jsx          # Public pricing display
├── SubscriptionManager.jsx  # Current plan, upgrade/downgrade
├── CheckoutModal.jsx        # Stripe Elements checkout
├── PaymentMethodCard.jsx    # Display saved cards
├── BillingHistory.jsx       # List of subscription invoices
├── UsageMeter.jsx          # Projects/users/storage usage
└── TrialBanner.jsx         # "X days left in trial" banner
```

### Feature Gating Pattern (Existing)

```javascript
// Already exists in BrandingSettings.jsx - extend this pattern
const tier = company?.subscription_tier || 'free'
const canCustomizeLogo = ['pro', 'business', 'enterprise'].includes(tier)

// New: Check limits
const subscription = useSubscription() // New hook
const canCreateProject = subscription.current_project_count < subscription.limits.max_projects
```

### Backend Enforcement (New)

```sql
-- RPC function to check if action is allowed
CREATE OR REPLACE FUNCTION check_subscription_limit(
  p_company_id UUID,
  p_resource TEXT, -- 'projects', 'users', 'storage'
  p_increment INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription RECORD;
  v_plan RECORD;
  v_current INTEGER;
  v_limit INTEGER;
BEGIN
  -- Get current subscription
  SELECT * INTO v_subscription
  FROM company_subscriptions
  WHERE company_id = p_company_id
  AND status IN ('active', 'trialing');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_active_subscription');
  END IF;

  -- Get plan limits
  SELECT * INTO v_plan
  FROM subscription_plans
  WHERE id = v_subscription.plan_id;

  -- Check specific resource
  CASE p_resource
    WHEN 'projects' THEN
      SELECT current_project_count INTO v_current FROM companies WHERE id = p_company_id;
      v_limit := v_plan.max_projects;
    WHEN 'users' THEN
      SELECT current_user_count INTO v_current FROM companies WHERE id = p_company_id;
      v_limit := v_plan.max_users;
    ELSE
      RETURN jsonb_build_object('allowed', false, 'reason', 'unknown_resource');
  END CASE;

  -- Unlimited check
  IF v_limit IS NULL THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  -- Limit check
  IF (v_current + p_increment) > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'limit_exceeded',
      'current', v_current,
      'limit', v_limit
    );
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;
```

---

## Upgrade/Downgrade Handling

### Upgrade Flow (Immediate)

1. User clicks "Upgrade to Business"
2. Frontend calls `stripe.subscriptions.update()` with new price
3. Stripe calculates proration automatically
4. User charged difference immediately
5. Webhook updates `company_subscriptions`
6. `companies.subscription_tier` updated
7. New features unlocked immediately

### Downgrade Flow (End of Period)

1. User clicks "Downgrade to Pro"
2. Show warning about feature loss
3. Check if within limits (projects, users)
4. If over limits: require reduction before downgrading
5. Schedule downgrade for end of billing period
6. Stripe handles via `cancel_at_period_end` + new subscription

```javascript
// Downgrade implementation
async function scheduleDowngrade(companyId, newPlanId) {
  // Check limits first
  const limitCheck = await supabase.rpc('check_downgrade_limits', {
    p_company_id: companyId,
    p_new_plan_id: newPlanId
  })

  if (!limitCheck.allowed) {
    throw new Error(`Please reduce ${limitCheck.resource} to ${limitCheck.limit} before downgrading`)
  }

  // Schedule the downgrade in Stripe
  await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
    metadata: { scheduled_plan: newPlanId }
  })

  // Create new subscription to start at period end
  // (handled by webhook when current subscription ends)
}
```

---

## Trial & Grace Period Handling

### Free Trial Flow

1. New company created → 14-day trial starts
2. Day 11: "3 days left" email
3. Day 14: Trial ends
4. If payment method added → Convert to paid
5. If no payment method → Restrict to "trial expired" mode

### Failed Payment Flow

1. **Day 0**: Payment fails → Status: `past_due`
2. **Day 1**: Email: "Payment failed, please update"
3. **Day 3**: Stripe Smart Retry #1
4. **Day 7**: Email: "Action required" + limit new project creation
5. **Day 14**: Final warning email
6. **Day 21**: Status: `unpaid` → Read-only mode
7. **Day 28**: Subscription canceled, data retained 90 days

---

## Safety Guarantees (How This Won't Break Anything)

### 1. Additive Schema Changes Only

```sql
-- ✅ SAFE: New tables
CREATE TABLE company_subscriptions (...)

-- ✅ SAFE: New nullable columns
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- ❌ NOT DOING: Modifying existing columns
-- ALTER TABLE companies ALTER COLUMN subscription_tier SET NOT NULL;
```

### 2. Backwards Compatible Defaults

```javascript
// Existing code continues to work
const tier = company?.subscription_tier || 'free' // Still works

// New subscription system is opt-in
const subscription = await getSubscription(companyId)
const effectiveTier = subscription?.plan?.tier || company?.subscription_tier || 'free'
```

### 3. Feature Flags for Rollout

```javascript
// Enable gradually
const SUBSCRIPTION_SYSTEM_ENABLED = import.meta.env.VITE_ENABLE_SUBSCRIPTIONS === 'true'

// Existing tier system works if subscriptions disabled
function getEffectiveTier(company) {
  if (!SUBSCRIPTION_SYSTEM_ENABLED) {
    return company.subscription_tier || 'free'
  }
  return company.subscription?.plan?.tier || company.subscription_tier || 'free'
}
```

### 4. No Breaking RLS Changes

```sql
-- Existing policies untouched
-- New policies only added to new tables
-- Existing table policies remain exactly as-is
```

### 5. Graceful Degradation

```javascript
// If Stripe is down, app still works
async function checkCanCreateProject(companyId) {
  try {
    const result = await supabase.rpc('check_subscription_limit', {
      p_company_id: companyId,
      p_resource: 'projects'
    })
    return result.allowed
  } catch (error) {
    // Stripe/subscription system error - allow action, log for review
    console.error('Subscription check failed, allowing action:', error)
    observe.error('subscription', { message: error.message, company_id: companyId })
    return true
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create Stripe account and products
- [ ] Run database migration (new tables only)
- [ ] Seed `subscription_plans` reference data
- [ ] Add `stripe_customer_id` column to companies

### Phase 2: Backend (Week 2)
- [ ] Create Supabase Edge Function for webhooks
- [ ] Implement subscription CRUD in supabase.js
- [ ] Add `check_subscription_limit` RPC function
- [ ] Create subscription event logging

### Phase 3: Checkout Flow (Week 3)
- [ ] Create PricingPage component
- [ ] Integrate Stripe Elements for checkout
- [ ] Implement trial start flow
- [ ] Add subscription to onboarding wizard

### Phase 4: Management (Week 4)
- [ ] Create SubscriptionManager component
- [ ] Implement upgrade/downgrade flows
- [ ] Build BillingHistory component
- [ ] Add PaymentMethodCard component

### Phase 5: Enforcement (Week 5)
- [ ] Add limit checks to project creation
- [ ] Add limit checks to team invites
- [ ] Implement trial expiration handling
- [ ] Add usage meters to dashboard

### Phase 6: Polish (Week 6)
- [ ] Trial ending notifications
- [ ] Failed payment email sequences
- [ ] Grace period restrictions
- [ ] Admin override capabilities

---

## Environment Variables Required

```bash
# Stripe (Production)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe (Test)
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_WEBHOOK_SECRET_TEST=whsec_...

# Feature flags
VITE_ENABLE_SUBSCRIPTIONS=true
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

## Testing Checklist

- [ ] New signup gets 14-day trial
- [ ] Trial countdown displays correctly
- [ ] Checkout with test card works
- [ ] Subscription status updates via webhook
- [ ] Upgrade charges correct proration
- [ ] Downgrade schedules for end of period
- [ ] Failed payment triggers past_due status
- [ ] Grace period restrictions work
- [ ] Existing users unaffected
- [ ] Feature gating works per tier
- [ ] Limit enforcement works

---

## Legal Considerations

1. **Terms of Service**: Update to include subscription terms, auto-renewal disclosure, cancellation policy
2. **Privacy Policy**: Update to mention Stripe as payment processor
3. **Refund Policy**: Define clearly (e.g., "no refunds for partial months")
4. **Auto-Renewal Disclosure**: Required by law in many states - Stripe handles compliant disclosures
5. **Tax Collection**: Use Stripe Tax for automatic sales tax calculation

---

## Questions to Decide Before Implementation

1. **Trial length**: 14 days recommended - confirm?
2. **Credit card for trial**: Recommend NO for higher signups - confirm?
3. **Annual discount**: 2 months free (17% off) - confirm?
4. **Grace period**: 21 days recommended - confirm?
5. **Refund policy**: No partial month refunds - confirm?
6. **Enterprise pricing**: Custom quotes only or starting price?
