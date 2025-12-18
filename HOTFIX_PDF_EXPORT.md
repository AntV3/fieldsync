# PDF Export Hotfix

## Issue
T&M PDF export was failing due to incorrect jsPDF import syntax.

## Root Cause
jsPDF v3.x requires using named exports instead of default export:
- ❌ `import jsPDF from 'jspdf'`
- ✅ `import { jsPDF } from 'jspdf'`

Similarly, jspdf-autotable v5.x should be imported explicitly:
- ❌ `import 'jspdf-autotable'` (side-effect only)
- ✅ `import autoTable from 'jspdf-autotable'`

## Fix Applied
**File**: `src/components/TMList.jsx`

**Before**:
```javascript
import jsPDF from 'jspdf'
import 'jspdf-autotable'
```

**After**:
```javascript
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
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
