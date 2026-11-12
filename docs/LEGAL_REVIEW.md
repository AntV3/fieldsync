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

### Fixed

| Issue | Fix |
|---|---|
| Photos under 500 KB were uploaded with their EXIF metadata, which can include the camera's GPS position, and reached anyone who could open the photo (including signers and portal viewers). | Every image is redrawn before upload, which removes the metadata (`src/lib/imageUtils.js`). A format the browser cannot decode is still uploaded as it is. |
| Field devices received the plain-text project PIN and its hash, and kept them in offline copies. | The field app asks for named columns without them; offline copies never store them; the database refuses a field session both columns (`20261114_data_protection_hardening.sql`). Office users still see PINs. |
| PIN sign-in fell back to comparing the plain-text PIN; archived projects still accepted their PIN. | Sign-in checks only the bcrypt hash (every PIN is hashed first) and refuses archived projects. |
| The per-company cap on wrong PINs let someone lock a company's foremen out for 15 minutes. | Devices that signed in to the company in the last 30 days are not subject to the company cap. New devices still are (20 per 15 minutes), and every device has its own limit (5 per 15 minutes). |
| Signing out left company data on the device; Android backup could copy it to the cloud. | Signing out deletes offline copies of company data (unsent work is kept); Android backup is off. |
| The service worker stored each page under its address, so signing, portal and share link tokens were kept on the device. | Pages are cached under one key; old caches are replaced on the next visit. |
| Share and signing link tokens came from Postgres `random()` (not cryptographic); share tokens were 12 characters; anyone could call the generators. | 24 random characters from `gen_random_bytes()`; generators no longer callable without signing in. Existing links keep working. |
| Share links defaulted to never expiring; signing and portal links offered "no expiry". | Every link expires: share links default to 90 days, signing links up to 60 days, portal access up to 1 year. |
| No retention limits; cleanup functions never ran. | Scheduled cleanup: sign-in attempts after 24 hours, expired field sessions daily, error reports after 180 days, slow-request timings after 90 days, sent-email records after 180 days. |
| Passwords could be 6 characters. | Minimum 8 on sign-up, join and invitation screens. Also set the minimum in Supabase (Authentication > Policies) so it is enforced on the server. |
| No record of who agreed to which terms. | Agreement checkbox at sign-up; version and time stored on the account. |

### Still open (ranked)

| # | Severity | Issue | Suggested fix |
|---|---|---|---|
| 1 | Medium | **Last 4 digits of SSN** on crew sign-in sheets: kept (owner decision 2026-11-12: needed). Never shown on screen; printed on crew sign-in PDFs unless a company administrator turns it off (Settings > Security). Still stored as plain text in the crew check-in and in offline copies until sign-out. Disclosed in the Privacy Policy. | Encrypt the column at rest with a server-side key, and stop caching crew check-ins on field devices. |
| 2 | Medium | **PINs are 4 digits.** The limits above make guessing slow, but a 6-digit PIN would make it impractical. | Allow 6-digit PINs for new projects (the login screen needs a variable-length entry). |
| 3 | Medium | **No account or company deletion and no full-company export**; deleting a project leaves daily-report, observation and document files in storage. | Admin "close company" request flow and an export; delete all of a project's files with the project. Until then the Terms promise export and deletion on request, handled by hand. |
| 4 | Low | Error reports can contain database error text with row values, and full stack traces (now deleted after 180 days). | Trim stored error messages. |
| 5 | Low | Fonts load from Google Fonts and CDNFonts, sharing visitors' IP addresses (disclosed). | Self-host the fonts. |
| 6 | Low | Signer IP address can be self-reported when the hosting header is missing (described as best-effort in the policy). | None needed beyond the wording. |
| 7 | Low | Tables `field_access_log` and `field_activity_log` exist in production but not in the repository, so their contents were not reviewed. | Export their definitions and add them to the repository. |
| 8 | Info | Office users' two-factor authentication is optional. | Consider requiring it for administrators. |
