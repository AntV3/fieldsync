# PWA Phone Test Checklist

Run this on one iPhone and one Android phone against the production
Vercel URL before any release that touches the field flow. It costs
nothing and is the only way to confirm the installed web app actually
holds up on a jobsite.

Record the device, OS version, and date at the top of each run.

## 1. Install

| Step | iPhone (Safari) | Android (Chrome) | Pass? |
|---|---|---|---|
| Open the production URL in the browser | | | |
| Install banner appears within a few seconds | Shows "Tap Share, then Add to Home Screen" | Shows an **Install** button | |
| Follow the install steps | Share → Add to Home Screen → Add | Tap Install → Install | |
| FieldSync icon appears on the home screen with the correct icon | | | |
| Launch from the icon: opens full screen with no browser bar | | | |
| Dismiss the banner instead, reload: banner stays hidden | | | |

## 2. Field login

| Step | Pass? |
|---|---|
| Enter company code and 4-digit PIN | |
| Wrong PIN shows an error, correct PIN logs in | |
| Close the app fully and reopen: session is remembered | |

## 3. T&M ticket end to end

| Step | Pass? |
|---|---|
| Start a new T&M ticket | |
| Camera opens from the photo step (rear camera, not the photo library) | |
| Take a photo: it attaches with a thumbnail | |
| Pick an existing photo from the library as well | |
| Location permission prompt appears once; GPS stamp shows on the ticket | |
| Deny location: ticket still saves, just without a GPS stamp | |
| Fill crew hours and materials, reach Review | |
| Submit: ticket appears on the office dashboard within a few seconds | |

## 4. Signatures

| Step | Pass? |
|---|---|
| Open a ticket's signature page | |
| Draw a signature with a finger: strokes are smooth, no page scroll while drawing | |
| Clear and redraw works | |
| Save: signature shows on the ticket and in the PDF export | |

## 5. Offline

Offline covers T&M tickets only: description, crew hours (including custom
labor classes), materials, COR link and the foreman signature. Photos are not
saved offline; they need a connection.

Before this section: after every deploy, launch the installed app **online**
once (the service worker only caches the new build's files when they are
fetched), log in as foreman and open a T&M ticket on the test project so its
labor classes are cached.

| Step | Pass? |
|---|---|
| Turn on Airplane Mode, reopen the app: no login screen; offline indicator appears | |
| Start a T&M ticket: labor-class sections still render | |
| Fill description, 2 workers (8h + 2h OT), 1 material (qty 3), optional COR, your name — **no photo** | |
| Submit: within about 1 second step 5 shows "Saved on this phone" / "Will sync automatically when you have signal", no error toast | |
| Sign as foreman: "Signature saved"; client-signature options hidden with "Client signature is available after the ticket syncs" | |
| Done: home T&M card shows "1 waiting to sync"; home banner "1 ticket saved on phone"; bottom indicator "Offline · 1 ticket saved on phone" | |
| Force-quit and reopen (still offline): all three still show 1 | |
| Second ticket with 2 photos → Submit asks "No signal. Save the ticket without the 2 photo(s)? …"; Keep editing keeps the photos; Save without photos saves it; card shows 2 | |
| Turn Airplane Mode off, keep the app in the foreground: within about 15 seconds "Syncing 2 tickets…" then "Synced 2 tickets"; card returns to 0 | |
| Office dashboard shows exactly 2 new tickets, each once, status signed by the foreman, with crew hours, material, notes, signature; the second has no photos | |
| Dead radio (Wi-Fi with no internet): Submit reaches "Saved on this phone" within about 15 seconds, not a minute-long spinner | |
| If the indicator shows "Sign in to sync N ticket(s)", enter the foreman PIN: the tickets sync once | |
| If it shows "N ticket(s) could not sync — tell the office", report it with the device and time | |

## 6. Updates

| Step | Pass? |
|---|---|
| Deploy a visible change to production | |
| Reopen the installed app: new version loads within one or two launches | |

## 7. GC signing link (two phones)

Setup: founder checklist steps 5–9. "Phone B" is a phone that has never
opened FieldSync and is not logged in. Create a T&M link and a COR link
from the office phone and send them to Phone B.

| Step | Pass? |
|---|---|
| Phone B opens the T&M link cold: within ~3 s it shows company logo/name, project, work date, CE/PCO, notes, workers table (hours/OT), materials table, every photo as an image, foreman certification, and "Sign as GC" / "Sign as Client". No "Unable to Load Document" | |
| Long-press a photo: URL contains `/storage/v1/object/sign/tm-photos/`; removing `?token=` gives 400/403, not the image (bucket still private) | |
| Sign as GC (name "QA GC", title, company, acknowledgment): success overlay, then the signed state with the signature image, "QA GC — PM — GC Co", today's date, no Sign buttons. "Save a Copy" PDF contains the photos | |
| Reload on Phone B and open the link on the office phone: identical signed state. The office link modal shows "Fully Signed" with no Revoke button | |
| Office TMList (Pending filter, open during signing) shows the ticket as `client_signed` with the "Authorized by QA GC" badge within ~5 s, no reload. If only after reload, record it and check founder checklist step 8 | |
| SQL: latest `signatures` row = QA GC, slot 1, Phone B's user agent, `ip_address` non-null (or NULL if the gateway strips it; record which); `t_and_m_tickets.status = 'client_signed'`, `gc_signature_name = 'QA GC'`; `signature_requests.status = 'completed'` | |
| COR link on Phone B: header, scope, line items, totals, and a "T&M Backup" section with the ticket and its photos | |
| Sign the COR as GC: `change_orders.status = 'approved'`, `approved_at` set, one `cor_status_history` row with notes "GC signed via signature link"; "Download COR + Backup" PDF includes the backup ticket photos; office CORList shows Approved within ~5 s | |
| Double sign: a stale tab still showing Sign buttons submits: page reloads into the signed state with the inline notice "This document has already been signed." (never the full-page error); no new `signatures` row | |
| A second link for the same ticket: same notice; `gc_signature_name` still "QA GC" | |
| Revoked link: "This signature link has been revoked." | |
| `expires_at` set in the past: "This signature link has expired." | |
| Token edited by one character: "This signature link is invalid or has expired." | |
| SQL as anon: `select count(*) from t_and_m_tickets` → 0; `select * from signature_requests limit 1` → permission denied; `select public_get_document_for_signing('sig_nope')` → NULL; `select public_signing_ticket_json('<id>')` → permission denied | |
| SQL as owner: `public_get_document_for_signing('<valid>')::text` contains none of `rejection_reason`, `approved_by`, `photo_locations`, `cost_per_unit`, `signature_ip` | |
| Devtools (cold profile): no request to `api.ipify.org`, no CSP violation during load, sign and export; everything goes to `*.supabase.co` | |
| Leave the signed T&M page open > 60 min (or set the signed-URL TTL to 60 s in a dev build): "Save a Copy" still contains the photos | |
| A logged-in office user opening the link gets identical behavior | |

## Known limits of the web app path

- No push notifications. iOS web push needs the home-screen install and a
  server that sends pushes; neither is wired up yet.
- No haptic feedback on iPhone (Android supports vibration in the browser).
- Camera access from the installed app requires HTTPS, which Vercel provides.

Log any failure as a GitHub issue with the device, OS version, and the step
number from this checklist.
