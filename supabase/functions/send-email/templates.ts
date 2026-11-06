// Pure email templates for the send-email Edge Function.
//
// Everything here is deterministic and side-effect free so it can be unit
// tested without network, database or environment access. Every email is
// rendered as inline-styled HTML plus a plain-text alternative.

export interface Brand {
  company_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  hide_fieldsync_branding?: boolean | null;
}

export interface ProjectSummary {
  name?: string | null;
  job_number?: string | null;
}

export interface SignatureRequestDocument {
  document_type: "cor" | "tm_ticket";
  document_label: string;
  signature_token: string;
  expires_at?: string | null;
  requested_by_name?: string | null;
  cor_total_cents?: number | string | null;
}

export interface DocumentSignedDocument {
  document_type: "cor" | "tm_ticket";
  document_label: string;
  signer_name?: string | null;
  signer_title?: string | null;
  signer_company?: string | null;
  signed_at?: string | null;
  document_status?: string | null;
}

export interface TicketWorker {
  name?: string | null;
  role?: string | null;
  hours?: number | string | null;
  overtime_hours?: number | string | null;
}

export interface TmTicketDocument {
  ticket_id: string;
  work_date?: string | null;
  ce_pco_number?: string | null;
  notes?: string | null;
  created_by_name?: string | null;
  workers?: TicketWorker[] | null;
  item_count?: number | null;
  photo_count?: number | null;
}

interface ContextBase {
  to_email: string;
  to_name?: string | null;
  reply_to?: string | null;
  brand?: Brand | null;
  project?: ProjectSummary | null;
}

export interface SignatureRequestContext extends ContextBase {
  event_type: "signature_request";
  document: SignatureRequestDocument;
}

export interface DocumentSignedContext extends ContextBase {
  event_type: "document_signed";
  document: DocumentSignedDocument;
}

export interface TmTicketSubmittedContext extends ContextBase {
  event_type: "tm_ticket_submitted";
  document: TmTicketDocument;
}

export interface TestContext extends ContextBase {
  event_type: "test";
  document?: null;
}

export type EmailContext =
  | SignatureRequestContext
  | DocumentSignedContext
  | TmTicketSubmittedContext
  | TestContext;

export interface BuildOptions {
  /** Public app origin without a trailing slash, e.g. https://app.example.com */
  appBaseUrl: string;
  /** The EMAIL_FROM secret, e.g. "FieldSync <noreply@mail.example.com>" */
  fromDefault: string;
}

export interface BuiltEmail {
  from: string;
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
}

export const DEFAULT_PRIMARY_COLOR = "#2563eb";
const PLATFORM_NAME = "FieldSync";
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Integer cents to US dollars: 123450 -> "$1,234.50". Empty string for missing input. */
export function formatMoney(cents: number | string | null | undefined): string {
  if (cents === null || cents === undefined || cents === "") return "";
  const n = typeof cents === "number" ? cents : Number(cents);
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n);
  const abs = Math.abs(rounded);
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = (abs % 100).toString().padStart(2, "0");
  return `${rounded < 0 ? "-" : ""}$${dollars}.${rest}`;
}

function parseDateValue(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const trimmed = value.trim();
  // Date-only values (work_date) are calendar dates, never shifted by timezone.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    return new Date(
      Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])),
    );
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "2026-11-05" or an ISO timestamp -> "Nov 5, 2026" (UTC calendar date). */
export function formatDate(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = parseDateValue(value);
  if (!d) return String(value);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** ISO timestamp -> "Nov 5, 2026 at 3:04 PM UTC". */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = parseDateValue(value);
  if (!d) return String(value);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minutes = d.getUTCMinutes().toString().padStart(2, "0");
  return `${formatDate(d)} at ${h12}:${minutes} ${h24 < 12 ? "AM" : "PM"} UTC`;
}

function formatHours(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Collapse whitespace and strip control characters (subjects, header values). */
function oneLine(value: unknown): string {
  if (value === null || value === undefined) return "";
  // deno-lint-ignore no-control-regex
  return String(value).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ")
    .trim();
}

function humanize(value: string | null | undefined): string {
  const s = oneLine(value).replace(/_/g, " ");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function documentTypeLabel(type: string | null | undefined): string {
  return type === "tm_ticket" ? "T&M ticket" : "change order request";
}

// ---------------------------------------------------------------------------
// Brand handling
// ---------------------------------------------------------------------------

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function safeColor(value: unknown): string {
  return isHexColor(value) ? value.trim() : DEFAULT_PRIMARY_COLOR;
}

/** Dark text on light brand colours, white text otherwise. */
function contrastText(hex: string): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5 ? "#111827" : "#ffffff";
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function hidesPlatform(brand: Brand | null | undefined): boolean {
  return brand?.hide_fieldsync_branding === true;
}

function companyName(brand: Brand | null | undefined): string {
  const name = oneLine(brand?.company_name);
  if (name) return name;
  return hidesPlatform(brand) ? "Your contractor" : PLATFORM_NAME;
}

/** Splits "Name <addr@host>" into its parts; a bare address has no name. */
export function parseMailbox(value: string): { name: string; address: string } {
  const trimmed = value.trim();
  const m = /^(.*?)\s*<([^<>]+)>$/.exec(trimmed);
  if (m) {
    return { name: m[1].trim().replace(/^"(.*)"$/, "$1").trim(), address: m[2].trim() };
  }
  return { name: "", address: trimmed };
}

function formatMailbox(name: string, address: string): string {
  const clean = oneLine(name).replace(/["\\<>]/g, "").trim();
  if (!clean) return address;
  return /[()<>[\]:;@\\,."]/.test(clean) ? `"${clean}" <${address}>` : `${clean} <${address}>`;
}

/** "<Company> via <EMAIL_FROM display name>", or "<Company>" when white-labelled. */
export function buildFrom(brand: Brand | null | undefined, fromDefault: string): string {
  const { name: platformName, address } = parseMailbox(fromDefault);
  if (!address) return fromDefault;
  const company = oneLine(brand?.company_name);
  if (!company) {
    return hidesPlatform(brand) ? address : formatMailbox(platformName || PLATFORM_NAME, address);
  }
  if (hidesPlatform(brand)) return formatMailbox(company, address);
  return formatMailbox(`${company} via ${platformName || PLATFORM_NAME}`, address);
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value.trim());
}

function trimBase(appBaseUrl: string): string {
  return appBaseUrl.trim().replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface LayoutInput {
  brand?: Brand | null;
  preheader?: string;
  bodyHtml: string;
}

export function button(href: string, label: string, brand?: Brand | null): string {
  const bg = safeColor(brand?.primary_color);
  const fg = contrastText(bg);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
<tr><td style="border-radius:6px;background-color:${bg};">
<a href="${
    escapeHtml(href)
  }" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${fg};text-decoration:none;border-radius:6px;background-color:${bg};">${
    escapeHtml(label)
  }</a>
</td></tr></table>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1f2937;">${html}</p>`;
}

function smallParagraph(html: string): string {
  return `<p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#6b7280;">${html}</p>`;
}

function linkFallback(url: string): string {
  return smallParagraph(
    `If the button does not work, paste this link into your browser:<br><a href="${
      escapeHtml(url)
    }" style="color:#374151;word-break:break-all;">${escapeHtml(url)}</a>`,
  );
}

export function layout({ brand, preheader = "", bodyHtml }: LayoutInput): string {
  const name = companyName(brand);
  const color = safeColor(brand?.primary_color);
  const logo = safeHttpUrl(brand?.logo_url);
  const header = logo
    ? `<img src="${escapeHtml(logo)}" alt="${
      escapeHtml(name)
    }" height="40" style="display:block;height:40px;max-width:200px;border:0;outline:none;">`
    : `<span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#111827;">${
      escapeHtml(name)
    }</span>`;
  const footer = hidesPlatform(brand)
    ? `Sent on behalf of ${escapeHtml(name)}.`
    : `Sent by ${escapeHtml(name)} via ${PLATFORM_NAME}.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(name)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${
    escapeHtml(preheader)
  }</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;border-top:4px solid ${color};">
<tr><td style="padding:24px 32px 8px 32px;">${header}</td></tr>
<tr><td style="padding:16px 32px 24px 32px;">${bodyHtml}</td></tr>
<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9ca3af;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function textFooter(brand: Brand | null | undefined): string {
  const name = companyName(brand);
  return hidesPlatform(brand)
    ? `Sent on behalf of ${name}.`
    : `Sent by ${name} via ${PLATFORM_NAME}.`;
}

function projectLabel(project: ProjectSummary | null | undefined): string {
  const name = oneLine(project?.name) || "your project";
  const job = oneLine(project?.job_number);
  return job ? `${name} (Job #${job})` : name;
}

function greeting(toName: string | null | undefined): string {
  const name = oneLine(toName);
  return name ? `Hi ${name},` : "Hello,";
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

function renderSignatureRequest(ctx: SignatureRequestContext, base: string): Rendered {
  const doc = ctx.document;
  const brand = ctx.brand;
  const company = companyName(brand);
  const projectName = oneLine(ctx.project?.name) || "your project";
  const label = oneLine(doc.document_label) || "Document";
  const url = `${base}/sign/${encodeURIComponent(doc.signature_token)}`;
  const requester = oneLine(doc.requested_by_name);
  const who = requester ? `${requester} at ${company}` : company;
  const kind = documentTypeLabel(doc.document_type);
  const total = formatMoney(doc.cor_total_cents);
  const expiry = doc.expires_at ? formatDate(doc.expires_at) : "";

  const intro = `${who} has requested your signature on ${kind} ${label} for ${
    projectLabel(ctx.project)
  }.`;
  const bodyParts = [
    paragraph(escapeHtml(greeting(ctx.to_name))),
    paragraph(escapeHtml(intro)),
  ];
  if (total) bodyParts.push(paragraph(`Total: <strong>${escapeHtml(total)}</strong>`));
  bodyParts.push(button(url, "Review and sign", brand));
  if (expiry) bodyParts.push(paragraph(escapeHtml(`This link expires on ${expiry}.`)));
  bodyParts.push(linkFallback(url));
  bodyParts.push(
    smallParagraph("If you were not expecting this request, you can ignore this email."),
  );

  const textLines = [greeting(ctx.to_name), "", intro];
  if (total) textLines.push("", `Total: ${total}`);
  textLines.push("", `Review and sign: ${url}`);
  if (expiry) textLines.push("", `This link expires on ${expiry}.`);
  textLines.push(
    "",
    "If you were not expecting this request, you can ignore this email.",
    "",
    "--",
    textFooter(brand),
  );

  return {
    subject: `Signature requested: ${label} — ${projectName}`,
    html: layout({ brand, preheader: intro, bodyHtml: bodyParts.join("\n") }),
    text: textLines.join("\n"),
  };
}

function renderDocumentSigned(ctx: DocumentSignedContext, base: string): Rendered {
  const doc = ctx.document;
  const brand = ctx.brand;
  const label = oneLine(doc.document_label) || "Document";
  const signer = oneLine(doc.signer_name) || "The signer";
  const title = oneLine(doc.signer_title);
  const signerCompany = oneLine(doc.signer_company);
  let signerFull = signer;
  if (title) signerFull += `, ${title}`;
  if (signerCompany) signerFull += ` (${signerCompany})`;
  const when = formatDateTime(doc.signed_at);
  const status = humanize(doc.document_status);
  const url = `${base}/`;

  const intro = `${signerFull} signed ${documentTypeLabel(doc.document_type)} ${label} on ${
    projectLabel(ctx.project)
  }${when ? ` on ${when}` : ""}.`;
  const bodyParts = [paragraph(escapeHtml(greeting(ctx.to_name))), paragraph(escapeHtml(intro))];
  if (status) bodyParts.push(paragraph(`Current status: <strong>${escapeHtml(status)}</strong>`));
  bodyParts.push(button(url, "Open dashboard", brand));
  bodyParts.push(linkFallback(url));

  const textLines = [greeting(ctx.to_name), "", intro];
  if (status) textLines.push("", `Current status: ${status}`);
  textLines.push("", `Open dashboard: ${url}`, "", "--", textFooter(brand));

  return {
    subject: `Signed: ${label} by ${signer}`,
    html: layout({ brand, preheader: intro, bodyHtml: bodyParts.join("\n") }),
    text: textLines.join("\n"),
  };
}

function renderTmTicketSubmitted(ctx: TmTicketSubmittedContext, base: string): Rendered {
  const doc = ctx.document;
  const brand = ctx.brand;
  const projectName = oneLine(ctx.project?.name) || "your project";
  const workDate = formatDate(doc.work_date);
  const creator = oneLine(doc.created_by_name) || "A foreman";
  const workers = Array.isArray(doc.workers) ? doc.workers : [];
  const itemCount = toNumber(doc.item_count);
  const photoCount = toNumber(doc.photo_count);
  const cePco = oneLine(doc.ce_pco_number);
  const notes = typeof doc.notes === "string" ? doc.notes.trim() : "";
  const url = `${base}/`;

  const intro = `${creator} submitted a T&M ticket for ${projectLabel(ctx.project)}${
    workDate ? ` (work date ${workDate})` : ""
  }.`;
  const counts = `${plural(workers.length, "worker", "workers")} · ${
    plural(itemCount, "item", "items")
  } · ${plural(photoCount, "photo", "photos")}`;

  const cell =
    "padding:6px 8px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;";
  const head =
    "padding:6px 8px;border-bottom:2px solid #d1d5db;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;text-align:left;text-transform:uppercase;";
  let totalHours = 0;
  let totalOt = 0;
  const rows = workers.map((w) => {
    totalHours += toNumber(w.hours);
    totalOt += toNumber(w.overtime_hours);
    return `<tr><td style="${cell}">${escapeHtml(oneLine(w.name) || "—")}</td><td style="${cell}">${
      escapeHtml(oneLine(w.role))
    }</td><td style="${cell}text-align:right;">${
      escapeHtml(formatHours(w.hours))
    }</td><td style="${cell}text-align:right;">${
      escapeHtml(formatHours(w.overtime_hours))
    }</td></tr>`;
  });
  const table = workers.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 16px 0;">
<tr><th style="${head}">Worker</th><th style="${head}">Role</th><th style="${head}text-align:right;">Hours</th><th style="${head}text-align:right;">OT</th></tr>
${rows.join("\n")}
<tr><td style="${cell}font-weight:bold;" colspan="2">Total</td><td style="${cell}text-align:right;font-weight:bold;">${
      escapeHtml(formatHours(totalHours))
    }</td><td style="${cell}text-align:right;font-weight:bold;">${
      escapeHtml(formatHours(totalOt))
    }</td></tr>
</table>`
    : "";

  const bodyParts = [paragraph(escapeHtml(greeting(ctx.to_name))), paragraph(escapeHtml(intro))];
  if (cePco) bodyParts.push(paragraph(`CE/PCO: <strong>${escapeHtml(cePco)}</strong>`));
  if (table) bodyParts.push(table);
  bodyParts.push(paragraph(escapeHtml(counts)));
  if (notes) {
    bodyParts.push(
      paragraph(`<strong>Notes:</strong><br>${escapeHtml(notes).replace(/\r?\n/g, "<br>")}`),
    );
  }
  bodyParts.push(button(url, "Review ticket", brand));
  bodyParts.push(linkFallback(url));

  const textLines = [greeting(ctx.to_name), "", intro];
  if (cePco) textLines.push("", `CE/PCO: ${cePco}`);
  if (workers.length) {
    textLines.push("", "Workers:");
    for (const w of workers) {
      const role = oneLine(w.role);
      textLines.push(
        `- ${oneLine(w.name) || "—"}${role ? ` (${role})` : ""}: ${formatHours(w.hours)} h, ${
          formatHours(w.overtime_hours)
        } OT`,
      );
    }
    textLines.push(`Total: ${formatHours(totalHours)} h, ${formatHours(totalOt)} OT`);
  }
  textLines.push("", counts);
  if (notes) textLines.push("", "Notes:", notes);
  textLines.push("", `Review ticket: ${url}`, "", "--", textFooter(brand));

  return {
    subject: `New T&M ticket: ${projectName} — ${workDate || "no date"}`,
    html: layout({ brand, preheader: intro, bodyHtml: bodyParts.join("\n") }),
    text: textLines.join("\n"),
  };
}

function renderTest(ctx: TestContext, base: string): Rendered {
  const brand = ctx.brand;
  const url = `${base}/`;
  const intro = `This is a test email from ${
    companyName(brand)
  }. If you can read it, email delivery works.`;
  const bodyParts = [
    paragraph(escapeHtml(intro)),
    button(url, "Open app", brand),
    linkFallback(url),
  ];
  return {
    subject: "FieldSync email test",
    html: layout({ brand, preheader: intro, bodyHtml: bodyParts.join("\n") }),
    text: [intro, "", `Open app: ${url}`, "", "--", textFooter(brand)].join("\n"),
  };
}

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

export function buildEmail(ctx: EmailContext, opts: BuildOptions): BuiltEmail {
  const base = trimBase(opts.appBaseUrl);
  let rendered: Rendered;
  switch (ctx.event_type) {
    case "signature_request":
      if (!ctx.document?.signature_token) throw new TemplateError("missing signature_token");
      rendered = renderSignatureRequest(ctx, base);
      break;
    case "document_signed":
      if (!ctx.document) throw new TemplateError("missing document");
      rendered = renderDocumentSigned(ctx, base);
      break;
    case "tm_ticket_submitted":
      if (!ctx.document) throw new TemplateError("missing document");
      rendered = renderTmTicketSubmitted(ctx, base);
      break;
    case "test":
      rendered = renderTest(ctx, base);
      break;
    default:
      throw new TemplateError(
        `unknown event_type: ${String((ctx as { event_type?: unknown }).event_type)}`,
      );
  }
  const replyTo = typeof ctx.reply_to === "string" ? ctx.reply_to.trim() : "";
  return {
    from: buildFrom(ctx.brand, opts.fromDefault),
    subject: oneLine(rendered.subject),
    html: rendered.html,
    text: rendered.text,
    reply_to: isEmail(replyTo) ? replyTo : undefined,
  };
}
