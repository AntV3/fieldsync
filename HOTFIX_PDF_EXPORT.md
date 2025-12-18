# PDF Export Hotfix

## Issue
T&M PDF export was failing with error: `F.autoTable is not a function`

## Root Cause - UPDATED
Two issues were found and fixed:

### Issue 1: Incorrect jsPDF import
jsPDF v3.x requires named exports:
- ❌ `import jsPDF from 'jspdf'` (default export)
- ✅ `import { jsPDF } from 'jspdf'` (named export)

### Issue 2: Incorrect jspdf-autotable import
jspdf-autotable v5.x extends the jsPDF prototype via side-effect import:
- ❌ `import autoTable from 'jspdf-autotable'` (doesn't extend prototype)
- ✅ `import 'jspdf-autotable'` (side-effect import that extends jsPDF)

## Fix Applied
**File**: `src/components/TMList.jsx:4-5`

**Initial (broken)**:
```javascript
import jsPDF from 'jspdf'
import 'jspdf-autotable'
```

**First attempt (still broken)**:
```javascript
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'  // ❌ This doesn't work!
```

**Final fix (working)**:
```javascript
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'  // ✅ Side-effect import extends jsPDF.prototype
```

## Verification
- ✅ Build successful
- ✅ All 59 tests passing
- ✅ No breaking changes to API
- ✅ PDF export functionality restored

## Testing
To test the PDF export:
1. Navigate to T&M tickets list
2. Click "Export PDF" button
3. PDF should download with:
   - Company header with branding
   - Project information
   - Summary section (hours, workers, materials)
   - Labor table with worker details
   - Materials & Equipment table
   - Signature section for GC approval

## Related Packages
- jsPDF: v3.0.4
- jspdf-autotable: v5.0.2
