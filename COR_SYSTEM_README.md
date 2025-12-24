# FieldSync COR System - Planning Complete ✅

## What Was Created

I've created a comprehensive plan for implementing a Change Order Request (COR) creation and management system for FieldSync. This system will allow you to:

1. ✅ Create professional CORs with detailed pricing breakdowns
2. ✅ Auto-calculate labor, materials, equipment, and subcontractor costs from T&M tickets
3. ✅ Manipulate costs, markups, and fees before submitting
4. ✅ Associate tickets with CORs (during creation or after)
5. ✅ Link CORs to work areas
6. ✅ Capture GC signatures digitally
7. ✅ Export professional PDFs matching your reference image format
8. ✅ Full accessibility compliance (proper labels, IDs, keyboard navigation)

---

## Documents Created

### 1. **COR_SYSTEM_IMPLEMENTATION_PLAN.md**
   - **Purpose**: Comprehensive technical specification
   - **Contents**:
     - Complete database schema (6 new tables)
     - System architecture
     - Component breakdown
     - Calculation logic
     - Implementation phases (10 phases)
     - UI/UX guidelines
     - Testing strategy
     - Security considerations
   - **Use**: Reference document for understanding the entire system

### 2. **CLAUDE_CLI_PROMPT_COR_SYSTEM.md**
   - **Purpose**: Ready-to-use prompt for Claude CLI to build the system
   - **Contents**:
     - Step-by-step implementation instructions
     - All tasks broken down by phase
     - Code examples and patterns
     - Success criteria
     - Testing checklist
   - **Use**: Copy this entire file and paste it into Claude CLI to start implementation

### 3. **COR_SYSTEM_README.md** (this file)
   - **Purpose**: Quick start guide
   - **Use**: Overview and how to proceed

---

## System Overview

### Database Architecture

The system adds 6 new tables:

1. **change_orders** - Main COR table with all metadata, totals, and calculations
2. **change_order_labor** - Labor line items (hours, rates, totals)
3. **change_order_materials** - Material/containment/abatement items
4. **change_order_equipment** - Equipment line items
5. **change_order_subcontractors** - Subcontractor line items
6. **change_order_ticket_associations** - Links T&M tickets to CORs

All costs stored in cents (integers) to avoid decimal precision issues.
All percentages stored in basis points (1500 = 15.00%) for precision.

### Component Structure

```
/src/components/cor/
├── CORList.jsx                    # List all CORs
├── CORForm.jsx                    # 9-step wizard for creating CORs
├── CORFormSteps/
│   ├── Step1_BasicInfo.jsx        # Title, scope, period, area
│   ├── Step2_Tickets.jsx          # Select T&M tickets
│   ├── Step3_Labor.jsx            # Labor breakdown
│   ├── Step4_Materials.jsx        # Materials
│   ├── Step5_Equipment.jsx        # Equipment
│   ├── Step6_Subcontractors.jsx   # Subcontractors
│   ├── Step7_Markup.jsx           # Markup percentages
│   ├── Step8_Fees.jsx             # Additional fees
│   └── Step9_Review.jsx           # Final review
├── CORDetail.jsx                  # View/edit single COR
├── CORPricingBreakdown.jsx        # Reusable pricing display
├── CORSignature.jsx               # GC signature pad
├── CORExport.jsx                  # PDF generation
└── TicketCORAssignment.jsx        # Bulk ticket assignment

/src/lib/
├── supabase.js                    # Add COR database operations
└── corCalculations.js             # NEW: Calculation utilities
```

### User Workflows

#### Office Dashboard Workflow
1. Navigate to Project → CORs tab
2. Click "Create New COR"
3. Step through 9-step wizard:
   - Enter basic info (title, scope, period, area)
   - Select T&M tickets to include
   - Review/edit auto-populated labor (grouped by role)
   - Review/edit auto-populated materials
   - Review/edit auto-populated equipment
   - Add subcontractors manually
   - Adjust markup percentages (default: 15% labor/materials/equipment, 5% subs)
   - Adjust fee percentages (default: 1.44% liability, 1.00% bond, 0.101% license)
   - Review final pricing breakdown
4. Save as draft or submit for approval
5. Request GC signature
6. Export to PDF

#### Field User Workflow
1. Create T&M ticket (as usual)
2. During creation, see "Assign to COR" dropdown
3. Select existing COR (optional)
4. Submit ticket
5. Office can import ticket data into COR later

---

## How to Use These Documents

### Option 1: Implement with Claude CLI (Recommended)

1. **Copy the full prompt**:
   ```bash
   cat COR_SYSTEM_IMPLEMENTATION_PLAN.md CLAUDE_CLI_PROMPT_COR_SYSTEM.md
   ```

2. **Start a new Claude CLI session**:
   ```bash
   claude-code
   ```

3. **Paste the prompt from CLAUDE_CLI_PROMPT_COR_SYSTEM.md**

4. **Let Claude implement phase by phase**:
   - Claude will start with Phase 1 (Database Schema)
   - Then move through each phase systematically
   - You can ask for specific phases if you want to prioritize

5. **Review and test each phase**:
   - Test database migrations in Supabase
   - Test each component as it's built
   - Provide feedback and iterate

### Option 2: Implement Manually

1. **Read the Implementation Plan**:
   - Study `COR_SYSTEM_IMPLEMENTATION_PLAN.md`
   - Understand the database schema
   - Review the component structure

2. **Start with Phase 1**:
   - Create database migration file
   - Add all tables, indexes, functions
   - Test in Supabase

3. **Move through phases sequentially**:
   - Each phase builds on the previous
   - Test thoroughly before moving to next phase

4. **Use the CLI prompt as a checklist**:
   - `CLAUDE_CLI_PROMPT_COR_SYSTEM.md` has detailed tasks
   - Check off each task as you complete it

### Option 3: Hybrid Approach

1. **Use Claude CLI for database schema** (Phase 1)
2. **Review and test the schema**
3. **Use Claude CLI for data layer** (Phase 2)
4. **Build UI components incrementally** with Claude CLI
5. **Manually test and refine** after each component

---

## Key Features to Highlight

### 1. Professional Pricing Breakdown
The system generates pricing breakdowns that match your reference image:
- Clean table layout
- Organized sections (Labor, Materials, Equipment, Subs)
- Clear markup section (15% / 15% / 15% / 5%)
- Additional fees (liability, bond, license)
- Bold totals
- Professional appearance

### 2. Flexible Cost Manipulation
Before submitting a COR, office staff can:
- Adjust hours and rates for labor
- Override material costs
- Add custom line items
- Change markup percentages
- Adjust fee percentages
- See real-time calculation updates

### 3. Ticket Integration
- Auto-import labor from T&M tickets (grouped by role)
- Auto-import materials and equipment from tickets
- Associate tickets during creation or after
- Re-import updated ticket data
- Track which tickets belong to which COR

### 4. Work Area Association
- Link CORs to specific work areas
- Track change orders by breakdown structure
- Calculate COR value as % of contract

### 5. Digital Signatures
- Canvas-based signature capture
- Save signature as base64 image
- Display in COR detail and PDF
- Lock COR after signing

### 6. PDF Export
- Professional PDF matching reference image
- Includes company branding
- Embedded signatures
- Download or email

### 7. Full Accessibility
- All form fields have proper labels
- Unique IDs and names on all inputs
- Keyboard navigation support
- Screen reader compatible
- WCAG 2.1 AA compliant

---

## Estimated Implementation Timeline

Based on the phased approach:

- **Phase 1-2** (Database + Data Layer): 3-5 days
- **Phase 3-5** (Core UI - List, Form, Detail): 7-10 days
- **Phase 6-8** (Advanced Features - Associations, Signature, PDF): 5-7 days
- **Phase 9-10** (Accessibility, Polish, Testing): 3-4 days

**Total**: ~3-4 weeks for full implementation

You can also implement incrementally:
- Week 1: Database + Basic COR creation
- Week 2: Full form wizard + pricing display
- Week 3: Ticket integration + signatures
- Week 4: PDF export + polish

---

## Next Steps

### Immediate Next Steps:

1. **Review the Implementation Plan**:
   - Read `COR_SYSTEM_IMPLEMENTATION_PLAN.md`
   - Understand the scope and architecture
   - Ask questions if anything is unclear

2. **Decide on approach**:
   - Use Claude CLI for full implementation?
   - Build manually with plan as guide?
   - Hybrid approach?

3. **Start with Phase 1**:
   - Create database schema
   - Test in Supabase
   - Verify all tables and functions work

4. **Iterate**:
   - Build phase by phase
   - Test each phase thoroughly
   - Get user feedback early and often

### Questions to Consider:

Before starting implementation, clarify:
1. Should COR numbers be per-project or company-wide?
2. Can tickets belong to multiple CORs, or just one?
3. Can approved CORs be edited, or completely locked?
4. Should there be email notifications for COR status changes?
5. Who can sign CORs - only GC role, or also office/admin?

---

## Why This Will Be a Game Changer

### Current Pain Points (Solved):
❌ Manual change order creation is time-consuming
❌ Difficult to track which tickets belong to which COR
❌ No way to manipulate costs before submitting
❌ Paper-based signatures slow down approvals
❌ Inconsistent formatting of change orders

### After Implementation:
✅ Create professional CORs in minutes, not hours
✅ Auto-populate from T&M tickets (saves time & reduces errors)
✅ Full control over costs and markups before submission
✅ Digital signatures speed up approval process
✅ Consistent, professional formatting every time
✅ Clear audit trail (who created, when, who approved)
✅ Easy to track CORs by project, area, or date
✅ Export to PDF with one click
✅ Office dashboard visibility into all change orders

### Competitive Advantage:
This level of COR management is **rare** in construction software. Most tools either:
- Have basic change order tracking (no cost breakdown)
- Require manual data entry (no T&M integration)
- Lack professional formatting
- Don't support digital signatures

FieldSync will have **all of these features** in one cohesive system.

---

## Support & Questions

If you have questions during implementation:

1. **Database/Schema Questions**: Refer to Section 1 of Implementation Plan
2. **Component Questions**: Refer to Section 2 (Architecture) and Section 5 (Components)
3. **Calculation Questions**: Refer to Section 4 (Calculation Logic)
4. **UI/UX Questions**: Refer to Section 7 (UI/UX Considerations)

For technical implementation questions, use the CLI prompt with Claude Code - it has detailed task breakdowns and code examples.

---

## Success Metrics

You'll know the system is successful when:
- ✅ Office staff can create a complete COR in under 15 minutes
- ✅ All calculations are 100% accurate
- ✅ PDFs look professional and match the reference image
- ✅ Users say "This is a game changer!"
- ✅ Adoption rate is >80% within first month
- ✅ COR approval time decreases by >50%

---

## Final Thoughts

This COR system represents a **major upgrade** to FieldSync. The planning is complete, the architecture is solid, and the implementation path is clear.

The key to success:
1. **Start with the database** - get the foundation right
2. **Build incrementally** - test each phase before moving on
3. **Get user feedback early** - show the office staff prototypes
4. **Iterate based on feedback** - real-world usage will reveal improvements
5. **Celebrate milestones** - this is a big project, recognize progress

You've got everything you need to build this. Let's make FieldSync the best construction project management tool out there! 🚀

---

**Ready to start?** Copy the content from `CLAUDE_CLI_PROMPT_COR_SYSTEM.md` and let's build this! 💪
