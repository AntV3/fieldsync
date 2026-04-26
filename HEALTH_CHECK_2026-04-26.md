# FieldSync Daily Health Check — 2026-04-26

Branch: `claude/determined-bell-h4dvM`

Daily code review and health check covering build/test/lint/audit status,
dependency posture, and any drift since the 2026-04-19 audit and 2026-04-23
launch-readiness review.

## TL;DR

FieldSync is **operating nominally**. Build, tests, and lint pass cleanly.
One fixable security advisory was applied this run (`postcss` → 8.5.12).
The only remaining `npm audit` finding is `xlsx`, which has no upstream
fix and is tracked as a planned migration (see "Carry-overs" below).

| Check | Result | Δ vs. 2026-04-19 |
| --- | --- | --- |
| `npm run build` | ✅ pass (~17s) | unchanged |
| `npm test` | ✅ 361/361 passing | +50 tests |
| `npm run lint` | ✅ 0 errors / 125 warnings | −114 warnings |
| `npm audit` | 1 high (xlsx, no fix) | −4 advisories |

## 1. Build

`npm run build` succeeds in ~17s.

Bundle output (top chunks):

| Chunk | Size | Gzip |
| --- | ---: | ---: |
| `index-*.js` | 1,091 kB | 301 kB |
| `xlsx-*.js` | 429 kB | 143 kB |
| `pdf-*.js` | 418 kB | 136 kB |
| `supabase-*.js` | 181 kB | 47 kB |

The main `index` chunk is still over Vite's 500 kB warning threshold. This
is the same finding as the 2026-04-19 audit; `vite.config.js` already
manual-chunks react/supabase/pdf/xlsx/icons, but more route-level
`React.lazy` would shave the main bundle further. **No regression.**

## 2. Tests

`npm test` — **361/361 passing** across 9 files in 5.4s.

Test count is up from 311 (2026-04-19) → 361, a +16% increase, indicating
healthy growth in coverage since the last full audit. No failing or
skipped tests; no flakes observed across two consecutive runs.

## 3. Lint

`npm run lint` — **0 errors, 125 warnings** (down from 239 on 2026-04-19).

Warning breakdown:

| Rule | Count | Risk |
| --- | ---: | --- |
| `react-hooks/exhaustive-deps` | 80 | per-case review needed (auto-fix can change behavior) |
| `no-unused-vars` | 29 | low — mostly unused props / catch bindings |
| `react-refresh/only-export-components` | 16 | architectural — context files mix component + hook exports |

None of these are blocking. The exhaustive-deps cases need behavioral
review before fixing because adding a missing dep can introduce render
loops or stale-closure-versus-fresh-fetch trade-offs that the current
code intentionally chose. The `react-refresh` warnings only affect
HMR fast-refresh during dev; they don't impact production behavior.

**No regression.**

## 4. Security audit

`npm audit` posture this run:

| Package | Severity | Status |
| --- | --- | --- |
| `postcss` <8.5.10 | moderate | **fixed this run** (→ 8.5.12, applied via `npm audit fix`) |
| `xlsx` * | high | **no upstream fix** — package abandoned npm registry |

### Fixed today
- **postcss XSS via unescaped `</style>`** (GHSA-qx2v-qp2m-jg93). Bumped
  to 8.5.12 in `package-lock.json`. Build and test pass on the new
  version. No source changes required.

### Carry-over
- **xlsx (SheetJS) — Prototype Pollution + ReDoS** (GHSA-4r6h-8v6p-xvw6,
  GHSA-5pgg-2g8v-p4x9). Vendor publishes only on their own CDN now;
  there is no patched version on npm. Migration options: `exceljs`,
  `xlsx-js-style`, or vendoring SheetJS's CDN build. This is a multi-day
  task touching every `import * from 'xlsx'` site (Sage exports,
  COR/draw exports, etc.) — out of scope for a daily check, but it
  should be triaged into a tracked issue. The risk profile is mitigated
  by the fact that `xlsx` only parses files the user (or office staff)
  uploads themselves, and the prototype-pollution gadget is not reachable
  from anonymous input.

## 5. Drift since 2026-04-23 launch-readiness audit

Reviewed commits since `1e99c7a` (the launch-readiness hardening
landing on 2026-04-23):

- `2a7e0f7` — Grant anon CRUD on `field_observations` (foreman visibility fix)
- `6e5546c` — Surface Field Observations in foreman view
- `5a69bf2` — Add PDF/CSV export for disposal load documentation
- `91c6b1f` — Office Overview: remove disposal load entry, keep read-only summary
- `b91d810` — Fix PIN auth 404 (extensions schema in SECDEF search_path)
- `b70d410` — Extend foreman session to 30 days when remember-me is enabled

All merged through PRs (#246–#252) with no reverts. No new SQL migrations
introduced `USING (true)` policies; no new files in the legacy `database/`
tree. The PIN-auth fix (`b91d810`) directly closed a launch-blocker.

## 6. Recommended follow-ups (not blocking nominal operation)

1. **xlsx migration** — open a tracked issue; the dependency advisory
   will keep showing on every `npm audit` run until this is resolved.
2. **Lint warning burndown** — the 29 `no-unused-vars` warnings are
   low-risk one-line fixes (rename to `_var` or remove). Worth a
   dedicated cleanup PR.
3. **Main-bundle size** — route-level `React.lazy` for the heaviest
   tabs (`AnalyticsTab`, `FinancialsTab`, `Dashboard`) would push the
   main chunk under the 500 kB threshold.
4. **`react-hooks/exhaustive-deps`** — needs per-callsite review; not
   safe to auto-fix.

## 7. Action taken this run

- Ran `npm install` (clean install) — 543 packages, no install errors.
- Ran `npm run build` — pass.
- Ran `npm test` — 361/361 pass.
- Ran `npm run lint` — 0 errors, 125 warnings.
- Ran `npm audit` — identified postcss + xlsx.
- Applied `npm audit fix` — postcss bumped to 8.5.12.
- Re-ran `npm test` and `npm run build` after the fix — both still pass.
- No source files changed; only `package-lock.json` updated.
