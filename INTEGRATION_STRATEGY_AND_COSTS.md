# FieldSync Integration Strategy: Procore, Autodesk & Other Platforms

**Document Version:** 1.0
**Date:** December 24, 2024
**Purpose:** Strategic planning for integrating FieldSync with major construction management platforms

---

## 📋 Table of Contents

1. [Integration Strategy Overview](#integration-strategy-overview)
2. [Key Platforms to Integrate](#key-platforms-to-integrate)
3. [COR System Integration Points](#cor-system-integration-points)
4. [Procore Integration Details](#procore-integration-details)
5. [Autodesk Construction Cloud Integration](#autodesk-construction-cloud-integration)
6. [QuickBooks/Xero Integration](#quickbooksxero-integration)
7. [Technical Implementation Options](#technical-implementation-options)
8. [Data Mapping Strategy](#data-mapping-strategy)
9. [Integration Roadmap](#integration-roadmap)
10. [Cost Breakdown](#cost-breakdown)
11. [Monetization Strategy](#monetization-strategy)
12. [Recommendations](#recommendations)

---

## 🔄 Integration Strategy Overview

### Vision

Make FieldSync a powerful hub in the construction tech stack by seamlessly connecting with industry-standard platforms. Enable bidirectional data flow to eliminate double-entry and provide a unified source of truth.

### Key Platforms to Integrate With

1. **Procore** - Project management, financials, change orders (HIGHEST PRIORITY)
2. **Autodesk Construction Cloud** (BIM 360/Build) - Documents, models, issues
3. **QuickBooks/Xero** - Accounting and invoicing
4. **PlanGrid** - Field drawings and collaboration
5. **Excel/CSV** - Universal data import/export

---

## 📊 COR System Integration Points

### Integration Opportunities by Module

| FieldSync Module | Integration Target | Direction | Value |
|------------------|-------------------|-----------|-------|
| **CORs** | Procore Change Orders | Push | High |
| **CORs** | QuickBooks Invoices | Push | High |
| **CORs** | Autodesk ACC Documents | Push (PDF) | Medium |
| **T&M Tickets** | Procore Daily Logs | Push | Medium |
| **Projects** | Procore Projects | Pull | High |
| **Work Areas** | Procore Budget Line Items | Pull | High |
| **Labor Hours** | Procore Time Cards | Push | Low |
| **Materials** | Procore Commitments | Push | Medium |
| **Daily Reports** | Procore/ACC Daily Logs | Push | Medium |

---

## 🏗️ Procore Integration Details

### What You Can Sync

#### FROM Procore → FieldSync:

**Projects & Budgets:**
- Project data (name, number, budget, contract value)
- Budget line items → Map to FieldSync work areas
- Prime contract details
- Cost codes → Map to labor classes

**Change Orders:**
- Existing change orders → Pre-populate CORs
- Change order status updates
- Approved amounts

**Resources:**
- Vendors/Subcontractors
- Drawing sets (optional)
- Specifications (optional)

#### FROM FieldSync → Procore:

**Change Orders:**
- Approved CORs → Create Procore Change Events/PCOs
- COR line items → Budget line items
- COR PDFs → Procore documents
- Status updates (draft, pending, approved)

**Daily Operations:**
- T&M tickets → Daily logs
- Labor hours → Time cards
- Material usage → Commitments/Invoices
- Photos → Project photos

**Financial:**
- Cost tracking
- Invoice data

---

### Key Procore Workflows

#### Workflow A: Push Approved COR to Procore

```
1. User approves COR in FieldSync
   ↓
2. FieldSync formats data to Procore schema
   ↓
3. Creates "Change Order Request" in Procore via API
   POST /rest/v1.0/projects/{project_id}/change_order_requests
   ↓
4. Uploads COR PDF as attachment
   POST /rest/v1.0/change_order_requests/{id}/attachments
   ↓
5. Maps line items to Procore budget codes
   ↓
6. Returns Procore change order number to FieldSync
   ↓
7. Store Procore ID in FieldSync for future updates
```

**API Endpoints Used:**
- `POST /rest/v1.0/projects/{project_id}/change_order_requests`
- `POST /rest/v1.0/change_order_requests/{id}/line_items`
- `POST /rest/v1.0/change_order_requests/{id}/attachments`
- `PATCH /rest/v1.0/change_order_requests/{id}` (for updates)

---

#### Workflow B: Import Budget from Procore

```
1. User selects project in FieldSync
   ↓
2. Fetches Procore budget line items via API
   GET /rest/v1.0/projects/{project_id}/budget_line_items
   ↓
3. Creates/updates work areas in FieldSync
   ↓
4. Maps cost codes to labor/material categories
   ↓
5. Sets area weights based on budget allocation
   (Budget Line Item Amount / Total Budget) * 100
   ↓
6. Stores Procore budget line item ID for future sync
```

**API Endpoints Used:**
- `GET /rest/v1.0/projects/{project_id}/budget_line_items`
- `GET /rest/v1.0/projects/{project_id}/cost_codes`
- `GET /rest/v1.0/projects/{project_id}/line_item_types`

---

#### Workflow C: Sync T&M Tickets to Daily Logs

```
1. Field user creates T&M ticket in FieldSync
   ↓
2. End of day: Batch sync to Procore (or real-time)
   ↓
3. Creates daily log entry with labor/materials
   POST /rest/v1.0/projects/{project_id}/daily_logs
   ↓
4. Links to COR if applicable (via reference)
   ↓
5. Uploads T&M photos to daily log
```

**API Endpoints Used:**
- `POST /rest/v1.0/projects/{project_id}/daily_logs`
- `POST /rest/v1.0/daily_logs/{id}/attachments`

---

### Procore API Technical Details

#### Authentication: OAuth 2.0

**Flow:**
```
1. User clicks "Connect to Procore" in FieldSync
   ↓
2. Redirect to Procore OAuth authorization page:
   https://login.procore.com/oauth/authorize?
     client_id={YOUR_CLIENT_ID}&
     response_type=code&
     redirect_uri={YOUR_REDIRECT_URI}
   ↓
3. User authorizes FieldSync
   ↓
4. Procore redirects back with authorization code:
   https://yourapp.com/callback?code={AUTH_CODE}
   ↓
5. Exchange code for access token:
   POST https://login.procore.com/oauth/token
   {
     "grant_type": "authorization_code",
     "client_id": "{YOUR_CLIENT_ID}",
     "client_secret": "{YOUR_CLIENT_SECRET}",
     "code": "{AUTH_CODE}",
     "redirect_uri": "{YOUR_REDIRECT_URI}"
   }
   ↓
6. Store access_token and refresh_token (encrypted)
   ↓
7. Use access_token for API calls
   Header: Authorization: Bearer {ACCESS_TOKEN}
   ↓
8. Refresh token when expired (every 2 hours by default)
```

#### Rate Limits
- **3,600 requests per hour** per company
- **60 requests per minute** per company
- Use batch endpoints when possible to reduce API calls

#### API Versioning
- Current stable version: **v1.0**
- Beta version: **v1.1** (includes newer features)
- Recommend using v1.0 for production

---

### Procore Data Model for Change Orders

**Change Order Request Object:**
```json
{
  "id": 12345,
  "number": "PCO-001",
  "title": "Exploratory abatement at exterior glazing",
  "description": "Scope of work details...",
  "status": "draft", // draft, pending, approved, rejected, void
  "origin_data": "Field Change",
  "received_from": "General Contractor",
  "date_initiated": "2024-07-22",
  "total": "15646.30",
  "created_at": "2024-10-13T10:00:00Z",
  "updated_at": "2024-10-13T10:00:00Z",
  "line_items": [
    {
      "id": 1001,
      "description": "Labor - Abatement Workers",
      "quantity": 96,
      "unit_of_measure": "hours",
      "unit_price": "97.35",
      "amount": "9345.60",
      "budget_line_item_id": 5001
    }
  ]
}
```

---

## 🏢 Autodesk Construction Cloud Integration

### What You Can Sync

#### FROM Autodesk → FieldSync:

**Projects:**
- Project metadata (name, number, location)
- Document structure/folders

**Collaboration:**
- RFIs → Link to CORs (if RFI triggers change order)
- Issues → Link to T&M tickets
- Document versions → Reference in COR scope

#### FROM FieldSync → Autodesk:

**Documents:**
- COR PDFs → Upload to specific folder
- T&M photos → Upload to project photos
- Daily reports → Sync to ACC daily logs

**Data:**
- Cost data (if using Autodesk Build)
- Change order data

---

### Key Autodesk Workflows

#### Workflow A: Upload COR PDF to ACC Documents

```
1. COR approved in FieldSync
   ↓
2. Generate PDF
   ↓
3. Authenticate with Autodesk (3-legged OAuth)
   ↓
4. Get project folder ID for "Change Orders"
   GET /project/v1/hubs/{hub_id}/projects/{project_id}/folders
   ↓
5. Upload PDF to folder:
   POST /data/v1/projects/{project_id}/folders/{folder_id}/items
   ↓
6. Add custom attributes/metadata:
   - COR Number
   - Date
   - Status
   - Total Amount
   ↓
7. Store Autodesk document URN in FieldSync
```

**API Endpoints Used:**
- Autodesk Platform Services (APS) API
- `POST /oss/v2/buckets/{bucketKey}/objects/{objectName}`
- `POST /data/v1/projects/{project_id}/storage`
- `POST /data/v1/projects/{project_id}/items`

---

## 💰 QuickBooks/Xero Integration

### What You Can Sync

#### FROM FieldSync → QuickBooks:

**Invoicing:**
- Approved CORs → Create invoices
- Project info → Customer/Job mapping
- Line items → Invoice line items with descriptions

**Cost Tracking:**
- Labor hours → Payroll data (integration with payroll service)
- Material costs → Bills/Expenses
- Subcontractor costs → Bills to pay

**Job Costing:**
- Track costs by project
- Compare actual vs budget

---

### Key QuickBooks Workflows

#### Workflow A: Create Invoice from Approved COR

```
1. COR approved in FieldSync
   ↓
2. Map project to QuickBooks Customer
   (Store QB customer ID in FieldSync projects table)
   ↓
3. Create invoice with line items:
   POST /v3/company/{companyId}/invoice

   Line 1: Labor (subtotal + markup)
   Line 2: Materials (subtotal + markup)
   Line 3: Equipment (subtotal + markup)
   Line 4: Subcontractors (subtotal + markup)
   Line 5: Additional Fees
   ↓
4. Set invoice status to "Pending" or "Sent"
   ↓
5. Store QuickBooks invoice ID in FieldSync
   ↓
6. Sync invoice status back to FieldSync
   (Paid, Partial, Overdue)
```

**API Endpoints Used:**
- `POST /v3/company/{companyId}/invoice`
- `GET /v3/company/{companyId}/invoice/{invoiceId}`
- `POST /v3/company/{companyId}/invoice/{invoiceId}/send`

---

## 🔧 Technical Implementation Options

### Option 1: Direct API Integration ⭐ RECOMMENDED

**Architecture:**
```
┌─────────────────────────┐
│   FieldSync Frontend    │
│   (React)               │
└───────────┬─────────────┘
            │
            ↓
┌─────────────────────────┐
│   FieldSync Backend     │
│   (Supabase)            │
│                         │
│   Edge Functions for:   │
│   - OAuth callbacks     │
│   - Webhook handlers    │
│   - API proxies         │
└───────────┬─────────────┘
            │
            ↓
┌───────────────────────────────────────┐
│   Integration Module                  │
│   (Node.js service or Edge Functions) │
│                                       │
│   - Data mapping logic                │
│   - API client wrappers               │
│   - Retry/error handling              │
│   - Queue management                  │
└───────────┬───────────────────────────┘
            │
    ┌───────┴────────┬──────────┬──────────┐
    ↓                ↓          ↓          ↓
┌────────┐      ┌──────────┐  ┌───────┐  ┌───────┐
│Procore │      │ Autodesk │  │ QBooks│  │ Other │
│  API   │      │    API   │  │  API  │  │  APIs │
└────────┘      └──────────┘  └───────┘  └───────┘
```

**Pros:**
- ✅ Real-time sync
- ✅ Full control over data mapping
- ✅ Can handle complex workflows
- ✅ Better error handling
- ✅ Custom business logic

**Cons:**
- ❌ Requires development effort (60-100 hours)
- ❌ Need to maintain API connections
- ❌ Each platform has different API

**Best For:** Production-ready, scalable solution

---

### Option 2: Zapier/Make.com (No-Code Integration)

**Architecture:**
```
FieldSync → Webhook → Zapier → Procore/QuickBooks/etc.
```

**Example Zap:**
```
Trigger: New approved COR in FieldSync (webhook)
  ↓
Filter: Only if COR total > $5,000
  ↓
Action 1: Create change order in Procore
  ↓
Action 2: Upload PDF to Google Drive
  ↓
Action 3: Send Slack notification to PM
  ↓
Action 4: Create QuickBooks invoice
  ↓
Action 5: Update FieldSync with sync status (webhook)
```

**Pros:**
- ✅ Quick to set up (1-2 hours)
- ✅ No coding required
- ✅ Many pre-built connectors
- ✅ Visual workflow builder

**Cons:**
- ❌ Monthly cost ($20-$50/month per company)
- ❌ Less control over complex workflows
- ❌ May not support all data fields
- ❌ Can get expensive at scale

**Cost:**
- Zapier: $20/month (Starter), $50/month (Professional), $100/month (Team)
- Make.com: $9/month (Core), $16/month (Pro)

**Best For:** Quick validation, simple workflows, non-technical users

---

### Option 3: Middleware/Integration Platform (Scalable)

**Architecture:**
```
┌─────────────────┐
│   FieldSync     │
└────────┬────────┘
         │ (Webhook or API call)
         ↓
┌─────────────────────────┐
│  Integration Service    │
│  (Node.js/Express)      │
│  Hosted on:             │
│  - Railway              │
│  - Render               │
│  - AWS Lambda           │
│  - Google Cloud Run     │
│                         │
│  Features:              │
│  - Data mapping         │
│  - Queue management     │
│  - Error handling       │
│  - Retry logic          │
│  - Rate limiting        │
│  - Logging/monitoring   │
│  - Caching              │
└─────────┬───────────────┘
          │
    ┌─────┴──────┬──────────┬──────────┐
    ↓            ↓          ↓          ↓
┌────────┐  ┌──────────┐  ┌───────┐  ┌───────┐
│Procore │  │ Autodesk │  │ QBooks│  │ Slack │
└────────┘  └──────────┘  └───────┘  └───────┘
```

**Tech Stack Example:**
```javascript
// Integration service structure
/integration-service
  /src
    /controllers
      - procoreController.js
      - quickbooksController.js
      - autodeskController.js
    /services
      - procoreService.js (API wrapper)
      - queueService.js (Bull/BullMQ)
      - mappingService.js (data transformation)
    /models
      - syncLog.js
      - integrationConfig.js
    /routes
      - webhooks.js
      - oauth.js
    /utils
      - retry.js
      - encryption.js
      - logger.js
    app.js
    server.js
  package.json
  Dockerfile
```

**Pros:**
- ✅ Centralized integration logic
- ✅ Easy to add new platforms
- ✅ Can handle batching and retries
- ✅ Comprehensive logging/monitoring
- ✅ Scalable architecture
- ✅ Reusable across multiple FieldSync instances

**Cons:**
- ❌ More infrastructure to manage
- ❌ Higher initial development cost
- ❌ Hosting costs ($10-50/month)

**Hosting Costs:**
- Railway: $5-20/month
- Render: $7-25/month
- AWS Lambda: $0-10/month (pay per use)
- Google Cloud Run: $0-15/month

**Best For:** Multiple integrations, high volume, enterprise clients

---

## 📋 Data Mapping Strategy

### COR to Procore Change Order Mapping

| FieldSync COR Field | Procore Field | Type | Notes |
|---------------------|---------------|------|-------|
| `id` | - | - | FieldSync internal ID |
| `cor_number` | `number` | String | "COR #1" → "PCO-001" |
| `title` | `title` | String | Direct mapping |
| `description` | `description` | Text | Direct mapping |
| `scope_of_work` | `scope_of_work` | Text | Direct or append to description |
| `period_start` | `date_initiated` | Date | Use period_start |
| `period_end` | - | - | Store in description or custom field |
| `status` | `status` | Enum | Map: draft→draft, pending_approval→pending, approved→approved |
| `area_id` | - | - | Map to budget_line_item_id if possible |
| `labor_subtotal` | - | Integer | Sum of labor line items |
| `materials_subtotal` | - | Integer | Sum of material line items |
| `equipment_subtotal` | - | Integer | Sum of equipment line items |
| `subcontractors_subtotal` | - | Integer | Sum of sub line items |
| `cor_total` | `total` | Decimal | Convert cents to dollars: total/100 |
| `created_by` | - | - | Store in notes or custom field |
| `created_at` | `created_at` | DateTime | Direct mapping |

**Labor Line Items Mapping:**

| FieldSync Labor Item | Procore Line Item | Notes |
|---------------------|-------------------|-------|
| `labor_class` | `description` | "Abatement Worker" |
| `wage_type` | - | Include in description: "Abatement Worker - Foreman" |
| `regular_hours` + `overtime_hours` | `quantity` | Sum total hours |
| `regular_rate` (weighted avg) | `unit_price` | Calculate blended rate |
| `total` | `amount` | Convert cents to dollars |
| - | `unit_of_measure` | "hours" |
| - | `budget_line_item_id` | Map to Procore cost code |

**Material/Equipment/Sub Line Items:**

| FieldSync Item | Procore Line Item | Notes |
|----------------|-------------------|-------|
| `description` | `description` | Direct mapping |
| `quantity` | `quantity` | Direct mapping |
| `unit` | `unit_of_measure` | "each", "ton", "load", etc. |
| `unit_cost` | `unit_price` | Convert cents to dollars |
| `total` | `amount` | Convert cents to dollars |
| `source_type` | - | Store in notes or custom field |

**Markup & Fees:**
- Option 1: Add as separate line items in Procore
- Option 2: Include in unit prices (baked in)
- **Recommended:** Separate line items for transparency

Example:
```
Line Item: "Labor Markup (15%)" | Qty: 1 | Amount: $1,316.30
Line Item: "Materials Markup (15%)" | Qty: 1 | Amount: $172.38
Line Item: "Equipment Markup (15%)" | Qty: 1 | Amount: $141.26
Line Item: "Subcontractor Markup (5%)" | Qty: 1 | Amount: $150.00
Line Item: "Liability Insurance (1.44%)" | Qty: 1 | Amount: $XX.XX
Line Item: "Bond (1.00%)" | Qty: 1 | Amount: $XX.XX
Line Item: "License Fee (0.101%)" | Qty: 1 | Amount: $XX.XX
```

---

### COR to QuickBooks Invoice Mapping

| FieldSync COR Field | QuickBooks Field | Type | Notes |
|---------------------|------------------|------|-------|
| `cor_number` | `DocNumber` | String | Custom invoice number |
| `project_id` | `CustomerRef.value` | Integer | Map to QB Customer ID |
| `title` | `PrivateNote` | String | Internal note |
| `scope_of_work` | `CustomerMemo.value` | String | Shows on invoice |
| Labor subtotal + markup | `Line.Amount` | Decimal | Separate line or itemized |
| Materials subtotal + markup | `Line.Amount` | Decimal | Separate line |
| Equipment subtotal + markup | `Line.Amount` | Decimal | Separate line |
| Subs subtotal + markup | `Line.Amount` | Decimal | Separate line |
| Additional fees | `Line.Amount` | Decimal | Can be separate or bundled |
| `cor_total` | `TotalAmt` | Decimal | Validation field |
| `created_at` | `TxnDate` | Date | Invoice date |
| `approved_at` | `TxnDate` | Date | Use approval date |

**QuickBooks Invoice Line Item Structure:**

```json
{
  "Line": [
    {
      "DetailType": "SalesItemLineDetail",
      "Description": "Labor: Abatement Workers (96 hrs @ $97.35/hr)",
      "Amount": 9345.60,
      "SalesItemLineDetail": {
        "ItemRef": {
          "value": "1", // QB Item ID for "Labor"
          "name": "Labor"
        },
        "Qty": 96,
        "UnitPrice": 97.35
      }
    },
    {
      "DetailType": "SalesItemLineDetail",
      "Description": "Labor Markup (15%)",
      "Amount": 1401.84,
      "SalesItemLineDetail": {
        "ItemRef": {
          "value": "2", // QB Item ID for "Markup"
          "name": "Markup"
        }
      }
    }
  ]
}
```

---

## 🗺️ Integration Roadmap

### Phase 1: Export Capabilities (QUICK WIN)
**Timeline:** 1-2 weeks
**Effort:** 8-16 hours
**Cost:** $0 (your time) or $400-1,600 (developer)

**Deliverables:**
- ✅ Export COR as PDF (already planned)
- ✅ Export COR as Excel/CSV
- ✅ Export T&M tickets as CSV
- ✅ Export daily reports as PDF
- ✅ "Download" buttons in UI

**User Workflow:**
1. Generate COR in FieldSync
2. Click "Export as CSV"
3. Download file
4. Manually import to Procore/QuickBooks

**Benefits:**
- Immediate value
- No API integration needed
- Validates user demand
- Low risk

**Technical Requirements:**
```javascript
// Example CSV export function
export const exportCORToCSV = (cor) => {
  const rows = [
    ['Section', 'Description', 'Quantity', 'Unit', 'Unit Cost', 'Total'],
    // Labor rows
    ...cor.labor_items.map(item => [
      'Labor',
      `${item.labor_class} - ${item.wage_type}`,
      item.regular_hours + item.overtime_hours,
      'hours',
      (item.total / (item.regular_hours + item.overtime_hours) / 100).toFixed(2),
      (item.total / 100).toFixed(2)
    ]),
    // Materials rows
    ...cor.material_items.map(item => [
      'Materials',
      item.description,
      item.quantity,
      item.unit,
      (item.unit_cost / 100).toFixed(2),
      (item.total / 100).toFixed(2)
    ]),
    // ... equipment, subs, markups, fees
  ]

  const csvContent = rows.map(row => row.join(',')).join('\n')
  downloadFile(csvContent, `COR_${cor.cor_number}.csv`, 'text/csv')
}
```

---

### Phase 2: Webhook Notifications (FOUNDATION)
**Timeline:** 1-2 weeks
**Effort:** 12-20 hours
**Cost:** $0 (your time) or $600-2,000 (developer)

**Deliverables:**
- ✅ Webhook system for key events
- ✅ Settings page to configure webhook URLs
- ✅ Event payload documentation
- ✅ Retry logic for failed webhooks
- ✅ Webhook logs/monitoring

**Events to Support:**
- `cor.created`
- `cor.updated`
- `cor.approved`
- `cor.rejected`
- `cor.deleted`
- `ticket.created`
- `ticket.approved`
- `daily_report.submitted`

**Webhook Payload Example:**
```json
{
  "event": "cor.approved",
  "timestamp": "2024-12-24T10:30:00Z",
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "cor_number": "COR #1",
    "title": "Exploratory abatement",
    "status": "approved",
    "cor_total": 1564630, // cents
    "approved_by": "user@example.com",
    "approved_at": "2024-12-24T10:30:00Z",
    "project": {
      "id": "proj-123",
      "name": "TCC Vermont"
    },
    "url": "https://fieldsync.app/projects/proj-123/cors/cor-1"
  }
}
```

**Benefits:**
- Enables Zapier/Make.com integrations
- No API development needed
- Users can build custom workflows
- Foundation for future integrations

**Technical Implementation:**
```javascript
// Supabase Edge Function: webhooks/cor-approved.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const { corId } = await req.json()

  // Get COR data
  const cor = await getCORById(corId)

  // Get webhook URLs from settings
  const webhookUrls = await getWebhookUrls(cor.company_id, 'cor.approved')

  // Send webhook to each URL
  for (const url of webhookUrls) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'cor.approved',
          timestamp: new Date().toISOString(),
          data: cor
        })
      })
      // Log success
    } catch (error) {
      // Log error and queue for retry
    }
  }

  return new Response('OK', { status: 200 })
})
```

---

### Phase 3: Procore Direct Integration (HIGH VALUE)
**Timeline:** 3-4 weeks
**Effort:** 60-80 hours
**Cost:** $0-40 (your time + Claude) or $3,000-8,000 (developer)

**Deliverables:**

**Week 1: OAuth & Foundation**
- ✅ Procore Developer account setup
- ✅ OAuth 2.0 flow implementation
- ✅ "Connect to Procore" button in settings
- ✅ Token storage (encrypted)
- ✅ Token refresh logic
- ✅ Procore API client wrapper

**Week 2: COR Push to Procore**
- ✅ Data mapping logic (FieldSync COR → Procore schema)
- ✅ "Push to Procore" button on COR detail page
- ✅ Create Change Order Request via API
- ✅ Upload COR PDF as attachment
- ✅ Sync status tracking (pending, synced, error)
- ✅ Error handling and user notifications

**Week 3: Budget Import (Optional)**
- ✅ Import Procore budget line items
- ✅ Create/update work areas in FieldSync
- ✅ Map cost codes to categories
- ✅ "Import Budget from Procore" button

**Week 4: Testing & Polish**
- ✅ Test in Procore sandbox
- ✅ Handle edge cases
- ✅ User documentation
- ✅ Beta test with 2-3 customers
- ✅ Bug fixes

**UI Components Needed:**

1. **Settings Page: Procore Integration**
```
┌─────────────────────────────────────────┐
│  Procore Integration                    │
├─────────────────────────────────────────┤
│                                         │
│  Status: ● Connected                    │
│  Account: john@gggdemolition.com        │
│  Connected: Dec 20, 2024                │
│                                         │
│  [Disconnect]  [Test Connection]        │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  Default Mappings:                      │
│                                         │
│  Labor Cost Code:     [Select ▼]       │
│  Material Cost Code:  [Select ▼]       │
│  Equipment Cost Code: [Select ▼]       │
│  Subcontractor Code:  [Select ▼]       │
│                                         │
│  [Save Mappings]                        │
│                                         │
└─────────────────────────────────────────┘
```

2. **COR Detail: Procore Sync Status**
```
┌─────────────────────────────────────────┐
│  COR #1 - Exploratory abatement         │
│  Status: Approved                       │
├─────────────────────────────────────────┤
│                                         │
│  Procore Integration:                   │
│  ✓ Synced to Procore                    │
│  PCO Number: PCO-2024-001               │
│  Synced: Dec 24, 2024 10:30 AM          │
│                                         │
│  [View in Procore] [Re-sync]            │
│                                         │
└─────────────────────────────────────────┘
```

3. **COR Detail: Sync Button (Not Yet Synced)**
```
┌─────────────────────────────────────────┐
│  COR #1 - Exploratory abatement         │
│  Status: Approved                       │
├─────────────────────────────────────────┤
│                                         │
│  [Push to Procore]                      │
│                                         │
│  This will create a new Change Order    │
│  Request in Procore with all line items │
│  and upload the COR PDF.                │
│                                         │
└─────────────────────────────────────────┘
```

**Technical Architecture:**
```javascript
// /src/lib/integrations/procore.js

export class ProcoreClient {
  constructor(accessToken) {
    this.accessToken = accessToken
    this.baseUrl = 'https://api.procore.com/rest/v1.0'
  }

  async createChangeOrder(projectId, corData) {
    // 1. Map FieldSync COR to Procore schema
    const payload = this.mapCORToProcore(corData)

    // 2. Create change order request
    const response = await this.post(
      `/projects/${projectId}/change_order_requests`,
      payload
    )

    // 3. Upload PDF attachment
    if (corData.pdfUrl) {
      await this.uploadAttachment(response.id, corData.pdfUrl)
    }

    return response
  }

  mapCORToProcore(cor) {
    return {
      change_order_request: {
        title: cor.title,
        description: cor.scope_of_work,
        status: 'draft',
        date_initiated: cor.period_start,
        total: (cor.cor_total / 100).toFixed(2),
        line_items: [
          // Labor items
          ...cor.labor_items.map(item => ({
            description: `${item.labor_class} - ${item.wage_type}`,
            quantity: item.regular_hours + item.overtime_hours,
            unit_of_measure: 'hours',
            unit_price: (item.total / (item.regular_hours + item.overtime_hours) / 100).toFixed(2),
            amount: (item.total / 100).toFixed(2)
          })),
          // Material items
          ...cor.material_items.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unit_of_measure: item.unit,
            unit_price: (item.unit_cost / 100).toFixed(2),
            amount: (item.total / 100).toFixed(2)
          })),
          // Equipment, subs, markups, fees...
        ]
      }
    }
  }

  async post(endpoint, data) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Procore-Company-Id': this.companyId
      },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      throw new Error(`Procore API error: ${response.statusText}`)
    }

    return response.json()
  }
}
```

**Database Changes:**
```sql
-- Add Procore sync tracking to change_orders table
ALTER TABLE change_orders
ADD COLUMN procore_id TEXT,
ADD COLUMN procore_number TEXT,
ADD COLUMN procore_synced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN procore_sync_status TEXT CHECK (procore_sync_status IN ('pending', 'synced', 'error')),
ADD COLUMN procore_sync_error TEXT;

-- Store Procore credentials per company
CREATE TABLE integration_credentials (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('procore', 'quickbooks', 'autodesk')),
  access_token TEXT, -- Encrypted
  refresh_token TEXT, -- Encrypted
  token_expires_at TIMESTAMP WITH TIME ZONE,
  procore_company_id TEXT, -- Procore-specific
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(company_id, platform)
);

-- Track sync history
CREATE TABLE sync_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  entity_type TEXT NOT NULL, -- 'cor', 'ticket', 'daily_report'
  entity_id UUID NOT NULL,
  platform TEXT NOT NULL,
  action TEXT NOT NULL, -- 'push', 'pull', 'update'
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'pending')),
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_entity ON sync_logs(entity_type, entity_id);
CREATE INDEX idx_sync_logs_company ON sync_logs(company_id);
```

---

### Phase 4: QuickBooks Integration (ACCOUNTING)
**Timeline:** 2-3 weeks
**Effort:** 40-60 hours
**Cost:** $0-40 (your time + Claude) or $2,000-6,000 (developer)

**Deliverables:**
- ✅ QuickBooks OAuth setup
- ✅ "Connect to QuickBooks" in settings
- ✅ Create invoices from approved CORs
- ✅ Map projects to QB customers
- ✅ Sync invoice status (paid, pending, overdue)
- ✅ "Send Invoice" button

**Benefits:**
- Eliminates manual invoice creation
- Keeps accounting in sync
- Track payment status in FieldSync
- Reduce accounting errors

---

### Phase 5: Autodesk ACC Integration (DOCUMENTS)
**Timeline:** 2-3 weeks
**Effort:** 32-48 hours
**Cost:** $0-40 (your time + Claude) or $1,600-4,800 (developer)

**Deliverables:**
- ✅ Autodesk OAuth setup
- ✅ Upload COR PDFs to ACC folders
- ✅ Tag documents with metadata
- ✅ Link to ACC document from FieldSync
- ✅ Import RFIs (optional)

**Benefits:**
- Centralized document management
- Automatic upload of CORs
- Linked to project documents

---

## 💰 Cost Breakdown

### Procore API Access Costs

**Good News: Procore API is FREE!**

| Item | Cost | Notes |
|------|------|-------|
| **Procore API Access** | $0/month | Free for standard integrations |
| **Developer Sandbox** | $0 | Free testing environment |
| **App Marketplace Listing** | 15% revenue share | Only if you charge for integration |
| **API Rate Limits** | Free | 3,600 requests/hour per company |

**Requirements:**
- ✅ Procore Developer Account (free) - https://developers.procore.com/
- ✅ OAuth 2.0 app registration (free)
- ✅ No monthly fees or usage charges

---

### Development Costs

#### **Option A: Build It Yourself (Your Time + Claude Code)**

**Estimated Time:**
- OAuth Setup & Authentication: 8-12 hours
- Data Mapping (COR → Procore): 12-16 hours
- API Integration Logic: 16-24 hours
- UI for Settings/Configuration: 8-12 hours
- Error Handling & Retry Logic: 8-12 hours
- Testing & Debugging: 16-20 hours
- Documentation: 4-8 hours

**Total: 72-104 hours** (roughly 2-3 weeks of focused work)

**Your Cost:**
- Claude Pro subscription: **$20/month**
- Your time (opportunity cost)
- **Total: ~$20-40**

**Pros:**
- ✅ Lowest cost
- ✅ You learn the system (easier to maintain)
- ✅ Can iterate quickly
- ✅ Full control

**Cons:**
- ❌ Time investment (2-3 weeks)
- ❌ Learning curve for APIs

---

#### **Option B: Hire a Freelance Developer**

**Developer Rates (US-based):**

| Experience Level | Hourly Rate | Total Cost (80 hrs) |
|-----------------|-------------|---------------------|
| **Junior Developer** | $40-$60/hr | $3,200 - $4,800 |
| **Mid-Level Developer** | $60-$100/hr | $4,800 - $8,000 |
| **Senior Developer** | $100-$150/hr | $8,000 - $12,000 |

**Developer Rates (International):**

| Region | Hourly Rate | Total Cost (80 hrs) |
|--------|-------------|---------------------|
| **Eastern Europe** | $30-$50/hr | $2,400 - $4,000 |
| **Latin America** | $25-$45/hr | $2,000 - $3,600 |
| **Asia** | $20-$40/hr | $1,600 - $3,200 |

**Recommended Budget: $4,000 - $8,000** for a quality mid-level developer

**Where to Find Developers:**
- **Upwork** - Vetted freelancers, escrow protection
- **Toptal** - Premium, pre-vetted (more expensive)
- **Fiverr Pro** - Mid-tier freelancers
- **Gun.io** - Vetted US-based contractors
- **LinkedIn** - Post job, review profiles

**What to Look For:**
- Experience with React/JavaScript
- Experience with REST APIs
- OAuth 2.0 implementation experience
- Portfolio of similar integrations
- Good communication skills
- US timezone overlap (if important)

---

#### **Option C: Hire a Development Agency**

**Agency Rates:**

| Agency Type | Hourly Rate | Total Cost (80 hrs) |
|-------------|-------------|---------------------|
| **US Agency** | $100-$200/hr | $8,000 - $16,000 |
| **International Agency** | $50-$100/hr | $4,000 - $8,000 |

**Pros:**
- ✅ Professional quality
- ✅ Project management included
- ✅ Multiple developers (faster delivery)
- ✅ Often includes support period

**Cons:**
- ❌ Higher cost
- ❌ Less flexibility
- ❌ May over-engineer

---

### Infrastructure Costs

**Monthly Hosting/Service Costs:**

| Component | Service Options | Monthly Cost |
|-----------|----------------|--------------|
| **Webhook Endpoints** | Supabase Edge Functions | $0 (included) |
| **Database Storage** | Supabase (tokens, sync status) | $0-$5 |
| **Background Jobs** | Supabase Functions / Inngest | $0-$10 |
| **Monitoring/Logging** | Sentry Free Tier | $0 |
| **File Storage** | Supabase Storage (PDFs) | $0-$5 |

**Total Infrastructure: $0-$30/month**

**Scaling Costs (if you grow):**
- **10 companies:** $0-$30/month
- **100 companies:** $50-$100/month
- **1,000+ companies:** $200-$500/month

---

### Ongoing Maintenance Costs

**Annual Estimates:**

| Maintenance Type | Hours/Year | Cost @ $50/hr | Cost @ $100/hr |
|-----------------|-----------|---------------|----------------|
| **API Updates** | 4-8 hours | $200-$400 | $400-$800 |
| **Bug Fixes** | 8-16 hours | $400-$800 | $800-$1,600 |
| **Feature Enhancements** | 16-32 hours | $800-$1,600 | $1,600-$3,200 |
| **Support/Questions** | 8-16 hours | $400-$800 | $800-$1,600 |

**Total Annual Maintenance: $1,800 - $3,600 (DIY) or $3,600 - $7,200 (hired)**

Or **2-6 hours per month** if you maintain it yourself.

---

### Total Cost Summary

#### **Option 1: DIY with Claude Code (Recommended)**

**Year 1:**
- Initial Development: $20-40 (Claude subscription) + 80 hours of your time
- Infrastructure: $0-$30/month = $0-$360/year
- Maintenance: 24-48 hours of your time
- **Total Cash: $20-$400** + your time

**Year 2+:**
- Infrastructure: $0-$360/year
- Maintenance: 24-48 hours/year
- **Total Cash: $0-$360/year** + your time

---

#### **Option 2: Hire Freelance Developer**

**Year 1:**
- Initial Development: $4,000-$8,000 one-time
- Infrastructure: $0-$360/year
- Maintenance: $1,800-$3,600/year
- **Total: $5,800-$11,960**

**Year 2+:**
- Infrastructure: $0-$360/year
- Maintenance: $1,800-$3,600/year
- **Total: $1,800-$3,960/year**

---

#### **Option 3: Hire Agency**

**Year 1:**
- Initial Development: $8,000-$16,000
- Infrastructure: $0-$360/year
- Support (included 3-6 months): $0
- Maintenance (after support): $2,000-$4,000/year
- **Total: $10,000-$20,360**

**Year 2+:**
- Infrastructure: $0-$360/year
- Maintenance: $2,000-$4,000/year
- **Total: $2,000-$4,360/year**

---

#### **Option 4: Zapier (No-Code)**

**Year 1:**
- Setup: 2 hours of your time
- Zapier Subscription: $20-$100/month = $240-$1,200/year
- **Total: $240-$1,200** + 2 hours

**Year 2+:**
- Zapier Subscription: $240-$1,200/year
- **Total: $240-$1,200/year**

**Scaling Costs:**
- 10 companies @ $50/month each = $6,000/year
- 100 companies @ $50/month each = $60,000/year

---

## 💡 Cost-Saving Strategies

### 1. Phased Approach (Recommended)

Build incrementally instead of all at once:

| Phase | Deliverable | Cost (DIY) | Cost (Hired) | Value |
|-------|-------------|-----------|--------------|-------|
| **Phase 1** | Export CSV | 8 hours | $400-$800 | Immediate |
| **Phase 2** | Webhooks | 16 hours | $800-$1,600 | Foundation |
| **Phase 3A** | Procore OAuth | 16 hours | $800-$1,600 | Enable push |
| **Phase 3B** | Procore Push CORs | 24 hours | $1,200-$2,400 | Core value |
| **Phase 3C** | Procore Budget Import | 16 hours | $800-$1,600 | Nice-to-have |

**Total Phased: ~80 hours or $4,000-$8,000** (spread over 3-6 months)

**Benefits:**
- Validate demand before full investment
- Cash flow friendly
- Can stop if users don't want it
- Iterative feedback

---

### 2. Start with Zapier, Then Build Custom

**Month 1-3: Zapier Integration**
- Cost: $20-$50/month
- Time: 2 hours setup
- Value: Validate that customers want Procore integration

**Month 4+: Custom Integration (if validated)**
- Cost: $4,000-$8,000 one-time
- Time: 2-3 weeks
- Value: Better UX, lower ongoing cost

**ROI:**
- Zapier: $600/year ongoing
- Custom: $4,000 upfront, $0 ongoing (except infrastructure)
- **Break-even: ~7 months**

---

### 3. Use Open-Source Libraries

Leverage existing tools to reduce development time:

**Procore:**
- No official JavaScript SDK, but can build a wrapper
- Saves 20-30% development time

**OAuth:**
- Use `@supabase/auth-helpers` for OAuth flow
- Saves 40% on auth implementation

**API Client:**
- Use `axios` or `ky` for API calls
- Use `zod` for schema validation

**Example:**
```javascript
// Reusable API client
import ky from 'ky'

class ProcoreAPI {
  constructor(token) {
    this.client = ky.create({
      prefixUrl: 'https://api.procore.com/rest/v1.0',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      retry: 2,
      timeout: 30000
    })
  }

  async createChangeOrder(projectId, data) {
    return this.client.post(`projects/${projectId}/change_order_requests`, {
      json: data
    }).json()
  }
}
```

---

## 💰 Monetization Strategy

### Charge for Procore Integration

**Pricing Models:**

| Model | Price | Target | Annual Revenue (10 customers) |
|-------|-------|--------|-------------------------------|
| **Add-on Fee** | $50-$100/month | Per company | $6,000-$12,000 |
| **Premium Tier** | $200/month | Includes integrations | $24,000 |
| **Setup Fee** | $500 one-time | Initial configuration | $5,000 (one-time) |
| **Usage-Based** | $10 per COR synced | Pay as you go | Varies |

**Recommended: Tiered Pricing**

```
Basic Plan: $99/month
- COR system
- T&M tickets
- Daily reports
- CSV export

Professional Plan: $199/month
- Everything in Basic
- Procore integration ✨
- QuickBooks integration ✨
- Webhook automation
- Priority support

Enterprise Plan: $499/month
- Everything in Professional
- Autodesk ACC integration
- Custom integrations
- Dedicated account manager
- SLA guarantee
```

---

### ROI Calculation

**If you build Procore integration yourself ($40 cost):**

| Scenario | Monthly Revenue | Annual Revenue | Payback Period |
|----------|----------------|----------------|----------------|
| **5 customers @ $50/month** | $250 | $3,000 | <1 month |
| **10 customers @ $50/month** | $500 | $6,000 | <1 month |
| **20 customers @ $100/month** | $2,000 | $24,000 | <1 month |

**If you hire developer ($6,000 cost):**

| Scenario | Monthly Revenue | Annual Revenue | Payback Period |
|----------|----------------|----------------|----------------|
| **5 customers @ $50/month** | $250 | $3,000 | 24 months |
| **10 customers @ $50/month** | $500 | $6,000 | 12 months |
| **20 customers @ $50/month** | $1,000 | $12,000 | 6 months |
| **20 customers @ $100/month** | $2,000 | $24,000 | 3 months |

---

### Competitive Advantage

**Most construction software either:**
- ❌ Has no integrations
- ❌ Charges $500-$1,000/month for integrations
- ❌ Requires manual data entry
- ❌ Only syncs one-way

**FieldSync with Procore integration:**
- ✅ Bidirectional sync
- ✅ Affordable ($50-$100/month)
- ✅ Eliminates double-entry
- ✅ Real-time updates
- ✅ Professional COR formatting

**This is a significant competitive advantage!**

---

## 🎯 Recommendations

### For Immediate Value (This Month)

**Recommendation: Start with Export + Webhooks**

1. **Week 1-2:** Add CSV export to CORs
   - Cost: $0 (8 hours of your time)
   - Use Claude Code to generate export functions
   - Immediate value for customers

2. **Week 3-4:** Add webhook system
   - Cost: $20 (Claude subscription + 16 hours)
   - Use Claude Code to implement webhooks
   - Enables Zapier integration

3. **Week 5:** Create Zapier templates
   - Cost: $0 (2 hours)
   - "New Approved COR → Create Procore Change Order"
   - "New Approved COR → Create QuickBooks Invoice"
   - Publish to Zapier marketplace

**Total Investment:**
- Cash: $20
- Time: ~26 hours
- Value: Immediate integration capability

---

### For Long-Term Success (Next 3-6 Months)

**Recommendation: Build Procore Integration with Claude Code**

**Month 1:**
- Export CSV + Webhooks (as above)
- Validate customer demand with Zapier

**Month 2-3:**
- Build Procore OAuth + Push integration
- Use Claude Code to generate most of the code
- Cost: $20/month + 60 hours of your time
- Beta test with 3-5 customers

**Month 4:**
- Polish based on feedback
- Launch to all customers
- Create marketing materials
- Cost: 20 hours

**Total Investment:**
- Cash: $60 (3 months Claude)
- Time: ~106 hours over 4 months (26 hours/month)
- Revenue Potential: $6,000-$24,000/year

**ROI:** Massive (payback in <1 month if 10 customers pay $50/month)

---

### If You Want to Move Faster

**Recommendation: Hire a Developer for Procore Integration**

**Timeline:**
- Week 1: Hire developer (post job, review proposals)
- Week 2-4: Developer builds Procore integration
- Week 5: Review, test, iterate
- Week 6: Launch

**Cost:**
- Developer: $4,000-$6,000
- Your time (review/testing): 20 hours
- Total: $4,000-$6,000 + 20 hours

**Benefits:**
- Faster to market (6 weeks vs 4 months)
- Professional code quality
- You can focus on other priorities

**Downside:**
- Higher upfront cost
- Longer payback period (6-12 months)

---

### Decision Framework

**Choose DIY (Claude Code) if:**
- ✅ You have 20-30 hours/month to invest
- ✅ You want to learn the system
- ✅ You want lowest cost
- ✅ You're okay with 3-4 month timeline

**Choose Freelancer if:**
- ✅ You want faster delivery (6 weeks)
- ✅ You have $4k-$8k budget
- ✅ You want professional code
- ✅ You're busy with other priorities

**Choose Zapier if:**
- ✅ You want to test demand first
- ✅ You want zero development
- ✅ You're okay with $20-$50/month per customer
- ✅ You don't need advanced workflows

---

## 🚀 Next Steps

### Immediate Actions (This Week)

1. **Validate Demand**
   - Survey your current customers
   - Ask: "Would you pay $50/month for Procore integration?"
   - Ask: "What platforms do you use?" (Procore, Autodesk, QuickBooks)

2. **Create Procore Developer Account**
   - Go to https://developers.procore.com/
   - Register (free)
   - Explore API documentation
   - Create sandbox project

3. **Implement CSV Export**
   - Add export button to COR detail page
   - Test with real COR data
   - Get customer feedback

### Next Month

**If customers want Procore integration:**

**Option A (DIY):**
- Start Phase 2 (Webhooks)
- Begin Phase 3A (Procore OAuth)
- Use Claude Code to generate code
- Test in sandbox

**Option B (Hire Developer):**
- Post job on Upwork/LinkedIn
- Review proposals
- Hire developer
- Provide them with:
  - COR system documentation
  - API credentials
  - Test data

### Month 3+

- Launch Procore integration (beta)
- Get feedback from 3-5 customers
- Iterate based on feedback
- Launch to all customers
- Start marketing ("Now with Procore integration!")
- Begin QuickBooks integration (if demand exists)

---

## 📞 Support & Resources

### Procore API Resources
- Documentation: https://developers.procore.com/documentation
- API Reference: https://developers.procore.com/reference/rest/v1
- SDKs: https://developers.procore.com/documentation/sdks
- Support: developers@procore.com
- Community: Procore Developer Slack

### Autodesk Resources
- Documentation: https://aps.autodesk.com/
- API Reference: https://aps.autodesk.com/en/docs/
- Support: forge.help@autodesk.com

### QuickBooks Resources
- Documentation: https://developer.intuit.com/
- API Reference: https://developer.intuit.com/app/developer/qbo/docs/api
- Support: https://help.developer.intuit.com/

### General Integration Resources
- Zapier Developer Platform: https://zapier.com/developer
- OAuth 2.0 Guide: https://oauth.net/2/
- REST API Best Practices: https://restfulapi.net/

---

## 📝 Conclusion

**Key Takeaways:**

1. **Procore API is FREE** - No monthly costs, just development time
2. **DIY with Claude Code is cheapest** - $20-$40 total cost + your time
3. **Hiring a developer costs $4k-$8k** - Faster but higher upfront cost
4. **Start with exports + webhooks** - Immediate value, low risk
5. **Monetize the integration** - Charge $50-$100/month to offset costs
6. **ROI is excellent** - Payback in <1 month with 10 customers

**My Recommendation:**

Start with the phased approach:
1. **This week:** Add CSV export (8 hours, $0)
2. **Next week:** Add webhooks (16 hours, $20)
3. **Week 3-4:** Set up Zapier integration (2 hours, $0)
4. **Month 2-3:** Build Procore integration with Claude Code (60 hours, $20)

This gives you immediate value, validates demand, and builds a foundation for long-term success.

**Total investment: $40 + ~86 hours over 3 months**

**Potential return: $6,000-$24,000/year in new revenue**

---

**Ready to get started?** I can help you implement Phase 1 (CSV export) right now if you'd like! 🚀
