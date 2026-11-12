# Legal documents: owner decisions and attorney review

The Terms of Service (`/terms`) and Privacy Policy (`/privacy`) were rewritten on 2026-11-12. They are drafts written to match what the app does today. **They are not legal advice and should be reviewed by a licensed attorney before FieldSync is opened to the public.**

Text lives in:

- `src/components/legal/termsContent.js` (Terms)
- `src/components/legal/privacyContent.js` (Privacy Policy)
- `src/lib/legal.js` (company name, governing state, contact addresses, versions)

## 1. Owner must confirm (before public launch)

| Setting in `src/lib/legal.js` | Current value | What to confirm |
|---|---|---|
| `LEGAL_ENTITY` | FieldSync | The registered legal name of the business (for example "FieldSync LLC"). The Terms are a contract with this entity. |
| `GOVERNING_STATE`, `VENUE` | Delaware; courts in Delaware | The state where the business is organized or based. Courts far from you are costly. |
| `CONTACT_LEGAL`, `CONTACT_PRIVACY`, `CONTACT_SECURITY` | legal@, privacy@, security@fieldsync.com | That the domain is yours and each inbox is monitored. Privacy laws set response deadlines (often 30–45 days). |
| `TERMS_VERSION`, `PRIVACY_VERSION` | 2026-11-12 | Bump on every material change; the version each user agreed to is stored on their account. |

Also confirm:

- The Supabase project's region (Settings > General). The Privacy Policy says data is stored in the United States.
- Whether you have signed Supabase's and Vercel's data processing agreements (both offer one). The Privacy Policy says providers process data under their own commitments; a signed DPA strengthens this.
- The email provider used by the email worker, so it can be named in the sub-processor list.

## 2. Points for the attorney

1. **Disputes.** The draft uses courts plus a jury waiver and a class-action waiver. Many SaaS companies use arbitration instead. A class waiver without arbitration may not be enforceable everywhere. Decide which.
2. **Liability cap.** The greater of 12 months' fees or US $100, with carve-outs for indemnity, acceptable use breaches, and what law does not allow to be limited. During the free beta that means $100.
3. **Indemnity.** One-way (customer indemnifies FieldSync), covering customer data, disputes with clients/workers/signers, and links the customer grants. Customers may ask for a mutual IP indemnity at paid tiers.
4. **Electronic signatures.** The signing screens show an ESIGN/UETA consent and record name, title, company, time, IP address and browser for link signatures (on-site signatures record name, time and device details). ESIGN's consumer-disclosure rules apply when a signer is a consumer; signers here are normally businesses, but a homeowner client could be a consumer. Check whether a fuller consumer disclosure (right to withdraw consent, hardware/software requirements, paper-copy fee) is needed for those cases.
5. **Worker data.** Customers record worker names, hours, roles, photos, and injury details. The Terms make the customer responsible for notices and consents to workers. Check state law on employee monitoring and on photo GPS data, and whether California (CCPA/CPRA) employee-data rules apply to FieldSync as a service provider.
6. **Health information.** Injury reports hold medical details. FieldSync is not a HIPAA covered entity, but some states (for example Washington's My Health My Data Act) regulate health data broadly. Check whether the injury report feature needs extra terms or should be limited.
7. **Children.** The Service is limited to people 18 and over.
8. **Data processing terms.** Larger customers will ask for a Data Processing Addendum (FieldSync as their processor). Consider preparing one.
9. **Cookie banner.** The app shows a cookie notice with Accept/Decline. It uses only necessary storage (sign-in, offline data, preferences) and no advertising or analytics cookies. Check whether the banner text and the "Decline" button match what the law requires where you sell.
10. **Construction-specific clauses** (Terms section 8): that approving a change order in the app does not satisfy contractual notice, claim, lien or bond deadlines, and that injury reports do not satisfy OSHA or insurer reporting. Confirm wording.

## 3. What the app does to back the documents

- Sign-up, join and invitation screens require ticking "I agree to the Terms of Service and the Privacy Policy, and I am authorized to accept them for my company". The versions and time agreed are stored in the account's user metadata (`terms_version`, `privacy_version`, `terms_accepted_at`).
- Field sign-in, signing pages and the client portal link to both documents.
- Every signing screen shows the consent to sign electronically and what is recorded.

## 4. Data protection check (2026-11-12)

A read-only review of the code checked what personal data the app collects, where it goes, how it is protected, and how long it is kept. The Privacy Policy states only what this check found to be true.

### Already in place

- HTTPS everywhere, HSTS, a strict content security policy, framing and sniffing protection (`vercel.json`).
- Each company's data separated by database access rules, tested on production on 2026-11-12.
- Ticket photos and project documents in private storage, opened through 1-hour signed links.
- Office passwords handled by Supabase Auth; optional two-factor authentication.
- Field sessions: 256-bit random tokens, server-side expiry (12 hours, or 30 days with "remember me"), ended on sign-out.
- Public pages return a fixed list of fields; GPS positions, signer IP addresses, contact details and PINs never leave through them.
- No analytics, advertising trackers or error-tracking services; no `innerHTML` in the app; HTML escaped in emails.

### Fixed in this change

| Issue | Fix |
|---|---|
| Photos under 500 KB were uploaded with their EXIF metadata, which can include the camera's GPS position, and reached anyone who could open the photo (including signers and portal viewers). | Every image is now redrawn before upload, which removes the metadata (`src/lib/imageUtils.js`). A format the browser cannot decode is still uploaded as it is. |
| Share and signing link tokens came from Postgres `random()`, which is not a cryptographic generator; share tokens were 12 characters and anyone could call the generators. | `supabase/migrations/20261114_secure_link_tokens_and_cleanup.sql`: tokens from `gen_random_bytes()`, 24 characters; generators no longer callable without signing in. Existing links keep working. |
| The cleanup functions for expired field sessions and old PIN attempts existed but never ran. | The same migration schedules them with pg_cron (when installed). |
| Passwords could be 6 characters. | Minimum 8 on sign-up, join and invitation screens. Also set the minimum in Supabase (Authentication > Policies) so it is enforced on the server. |
| No record of who agreed to which terms. | Agreement checkbox at sign-up; version and time stored on the account. |

### Still open (ranked)

| # | Severity | Issue | Suggested fix |
|---|---|---|---|
| 1 | High | **Last 4 digits of SSN** collected on crew sign-in sheets, stored as plain text, printed in PDFs and cached on field devices. Disclosed in the Privacy Policy. | Owner decision: stop collecting it (recommended), or keep it and mask it in PDFs and on screen. |
| 2 | High | **Project PIN also stored in plain text** (`projects.pin`) next to the bcrypt hash; the PIN sign-in still accepts it, and offline caches hold it. | Stop sending the PIN column to field devices and caches; then decide whether office users need to see PINs again after creating them. |
| 3 | High | **4-digit PINs**: about 1,900 guesses a day per company are possible within the limits, and the same limit lets someone lock a company's foremen out for 15 minutes. Archived projects still accept their PIN. | 6-digit PINs (the database's own `validate_pin_format` already expects 6), refuse archived projects, and a per-project limit. |
| 4 | Medium | **Signing out does not clear offline copies** on the device (projects, crew sign-ins, tickets, drafts, unsent photos). Android backup is on. | Clear offline caches on sign-out (keeping unsent tickets), and turn off Android backup. |
| 5 | Medium | **No account or company deletion, no full-company export**, and deleting a project leaves daily-report, observation and document files in storage. | Admin "close company" request flow and an export; delete all of a project's files with the project. The Terms promise export and deletion on request, so these requests are handled by hand until then. |
| 6 | Medium | **No retention limits** on error logs, email records and activity logs. | Scheduled deletion after a set period (for example 12 months for logs, 90 days for delivered emails). |
| 7 | Medium | Share links default to **never expiring**; signing and portal links offer "no expiry". | Default share links to 90 days and remove "never" options. |
| 8 | Low | Error reports can contain database error text with row values, and full stack traces. | Trim stored error messages. |
| 9 | Low | Fonts load from Google Fonts and CDNFonts, sharing visitors' IP addresses (disclosed). | Self-host the fonts. |
| 10 | Low | Signer IP address can be self-reported when the hosting header is missing (described as best-effort in the policy). | None needed beyond the wording. |
| 11 | Low | Tables `field_access_log` and `field_activity_log` exist in production but not in the repository, so their contents were not reviewed. | Export their definitions and add them to the repository. |
