# Archived Components

> **DO NOT USE THESE COMPONENTS**
>
> These files are deprecated and kept only for historical reference.
> They have been replaced by newer implementations.

---

## Archived Files

| File | Replaced By | Reason |
|------|-------------|--------|
| `AuthPage.jsx` | `AppEntry.jsx` | Consolidated into new company join flow |
| `DumpSiteManager.jsx` | `pricing/DumpSitesSection.jsx` | Moved to pricing module |
| `Field.jsx` | `ForemanView.jsx` | Renamed and enhanced |
| `HaulOffForm.jsx` | `DisposalLoadInput.jsx` | Renamed with improved functionality |
| `Login.jsx` | `AppEntry.jsx` | Consolidated into company join flow |
| `MaterialsManager.jsx` | `pricing/MaterialsSection.jsx` | Moved to pricing module |
| `Onboarding.jsx` | `AppEntry.jsx` + `Setup.jsx` | Split into focused components |
| `PinEntry.jsx` | Integrated into `ForemanView.jsx` | No longer needed as separate component |

---

## Why These Are Archived (Not Deleted)

1. **Historical reference** - Understanding previous implementations
2. **Migration path** - In case features need to be recovered
3. **Documentation** - Understanding architectural decisions

---

## If You Need This Functionality

Look at the "Replaced By" column above. The new components have:
- Better code organization
- Improved user experience
- Consistent patterns with the rest of the codebase
- Active maintenance

---

*If you're importing from this folder, you're doing it wrong.*
