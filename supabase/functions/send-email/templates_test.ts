import { assert, assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  buildEmail,
  buildFrom,
  DEFAULT_PRIMARY_COLOR,
  type DocumentSignedContext,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatMoney,
  layout,
  parseMailbox,
  type SignatureRequestContext,
  TemplateError,
  type TestContext,
  type TmTicketSubmittedContext,
} from "./templates.ts";

const OPTS = {
  appBaseUrl: "https://app.example.com",
  fromDefault: "FieldSync <noreply@mail.example.com>",
};

const BRAND = {
  company_name: "Acme Electric",
  logo_url: "https://cdn.example.com/acme.png",
  primary_color: "#ff6600",
  hide_fieldsync_branding: false,
};

function sigRequest(overrides: Partial<SignatureRequestContext> = {}): SignatureRequestContext {
  return {
    event_type: "signature_request",
    to_email: "gc@builder.example",
    to_name: "Grace Contractor",
    reply_to: "office@acme.example",
    brand: BRAND,
    project: { name: "Tower A", job_number: "J-1042" },
    document: {
      document_type: "cor",
      document_label: "COR #7",
      signature_token: "sig_abc123",
      expires_at: "2026-11-12T17:00:00Z",
      requested_by_name: "Olivia Office",
      cor_total_cents: 123450,
    },
    ...overrides,
  };
}

function signed(overrides: Partial<DocumentSignedContext> = {}): DocumentSignedContext {
  return {
    event_type: "document_signed",
    to_email: "owner@acme.example",
    to_name: "Owen Owner",
    reply_to: null,
    brand: BRAND,
    project: { name: "Tower A", job_number: "J-1042" },
    document: {
      document_type: "cor",
      document_label: "COR #7",
      signer_name: "Grace Contractor",
      signer_title: "PM",
      signer_company: "Builder Co",
      signed_at: "2026-11-05T15:04:00Z",
      document_status: "approved",
    },
    ...overrides,
  };
}

function ticket(overrides: Partial<TmTicketSubmittedContext> = {}): TmTicketSubmittedContext {
  return {
    event_type: "tm_ticket_submitted",
    to_email: "office@acme.example",
    to_name: null,
    reply_to: null,
    brand: BRAND,
    project: { name: "Tower A", job_number: null },
    document: {
      ticket_id: "7f9c2a52-1111-4222-8333-944445555666",
      work_date: "2026-11-05",
      ce_pco_number: "PCO-12",
      notes: "Pulled wire\nfloor 3",
      created_by_name: "Frank Foreman",
      workers: [
        { name: "Zed Last", role: "Journeyman", hours: 8, overtime_hours: 2 },
        { name: "Amy First", role: "Apprentice", hours: 7.5, overtime_hours: 0 },
        { name: "Mo Middle", role: "Foreman", hours: "6", overtime_hours: null },
      ],
      item_count: 1,
      photo_count: 3,
    },
    ...overrides,
  };
}

function testCtx(overrides: Partial<TestContext> = {}): TestContext {
  return { event_type: "test", to_email: "me@example.com", brand: null, ...overrides };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

Deno.test("escapeHtml escapes the five HTML-significant characters and nullish input", () => {
  assertEquals(
    escapeHtml(`<a href="x">Tom & Jerry's</a>`),
    "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
  );
  assertEquals(escapeHtml(null), "");
  assertEquals(escapeHtml(undefined), "");
  assertEquals(escapeHtml(42), "42");
});

Deno.test("formatMoney formats integer cents as US dollars", () => {
  assertEquals(formatMoney(123450), "$1,234.50");
  assertEquals(formatMoney(0), "$0.00");
  assertEquals(formatMoney(5), "$0.05");
  assertEquals(formatMoney(100000000), "$1,000,000.00");
  assertEquals(formatMoney(-2599), "-$25.99");
  assertEquals(formatMoney("123450"), "$1,234.50");
  assertEquals(formatMoney(null), "");
  assertEquals(formatMoney(undefined), "");
  assertEquals(formatMoney("abc"), "");
});

Deno.test("formatDate keeps date-only values on their calendar day and formats timestamps", () => {
  assertEquals(formatDate("2026-11-05"), "Nov 5, 2026");
  assertEquals(formatDate("2026-01-01"), "Jan 1, 2026");
  assertEquals(formatDate("2026-11-12T17:00:00Z"), "Nov 12, 2026");
  assertEquals(formatDate(null), "");
  assertEquals(formatDate("not a date"), "not a date");
  assertEquals(formatDateTime("2026-11-05T15:04:00Z"), "Nov 5, 2026 at 3:04 PM UTC");
  assertEquals(formatDateTime("2026-11-05T00:30:00Z"), "Nov 5, 2026 at 12:30 AM UTC");
});

Deno.test("parseMailbox and buildFrom follow the From convention", () => {
  assertEquals(parseMailbox("FieldSync <noreply@mail.example.com>"), {
    name: "FieldSync",
    address: "noreply@mail.example.com",
  });
  assertEquals(parseMailbox("noreply@mail.example.com"), {
    name: "",
    address: "noreply@mail.example.com",
  });
  assertEquals(
    buildFrom(BRAND, OPTS.fromDefault),
    "Acme Electric via FieldSync <noreply@mail.example.com>",
  );
  assertEquals(
    buildFrom({ ...BRAND, hide_fieldsync_branding: true }, OPTS.fromDefault),
    "Acme Electric <noreply@mail.example.com>",
  );
  // Display names with RFC 5322 specials are quoted; quotes/angle brackets are stripped.
  assertEquals(
    buildFrom({ company_name: `Smith, Jones & "Co" <x>` }, OPTS.fromDefault),
    `"Smith, Jones & Co x via FieldSync" <noreply@mail.example.com>`,
  );
  // Bare EMAIL_FROM falls back to the platform name.
  assertEquals(
    buildFrom(BRAND, "noreply@mail.example.com"),
    "Acme Electric via FieldSync <noreply@mail.example.com>",
  );
  assertEquals(buildFrom(null, OPTS.fromDefault), "FieldSync <noreply@mail.example.com>");
});

// ---------------------------------------------------------------------------
// Layout and brand fallbacks
// ---------------------------------------------------------------------------

Deno.test("layout renders the logo, brand colour and platform footer", () => {
  const html = layout({ brand: BRAND, preheader: "Pre", bodyHtml: "<p>Body</p>" });
  assertStringIncludes(html, `<img src="https://cdn.example.com/acme.png"`);
  assertStringIncludes(html, `alt="Acme Electric"`);
  assertStringIncludes(html, "#ff6600");
  assertStringIncludes(html, "Sent by Acme Electric via FieldSync.");
  assertStringIncludes(html, "<p>Body</p>");
  assertStringIncludes(html, "Pre");
});

Deno.test("brand fallbacks: no logo, bad colour, missing name, missing brand", () => {
  const noLogo = layout({ brand: { company_name: "Acme Electric", logo_url: null }, bodyHtml: "" });
  assert(!noLogo.includes("<img"), "no img without a logo");
  assertStringIncludes(noLogo, ">Acme Electric</span>");
  assertStringIncludes(noLogo, DEFAULT_PRIMARY_COLOR);

  const badColor = layout({
    brand: {
      company_name: "Acme",
      primary_color: "red;background:url(x)",
      logo_url: "javascript:alert(1)",
    },
    bodyHtml: "",
  });
  assertStringIncludes(badColor, DEFAULT_PRIMARY_COLOR);
  assert(!badColor.includes("javascript:"), "non-http logo URLs are dropped");
  assert(!badColor.includes("url(x)"), "invalid colours are dropped");

  const noName = layout({ brand: { company_name: "  " }, bodyHtml: "" });
  assertStringIncludes(noName, ">FieldSync</span>");

  const noBrand = buildEmail(sigRequest({ brand: null }), OPTS);
  assertStringIncludes(noBrand.html, DEFAULT_PRIMARY_COLOR);
  assertEquals(noBrand.from, "FieldSync <noreply@mail.example.com>");

  const shortHex = layout({ brand: { company_name: "Acme", primary_color: "#0a0" }, bodyHtml: "" });
  assertStringIncludes(shortHex, "#0a0");
});

Deno.test("light brand colours get dark button text", () => {
  const email = buildEmail(sigRequest({ brand: { ...BRAND, primary_color: "#ffff00" } }), OPTS);
  assertStringIncludes(email.html, "color:#111827;text-decoration:none");
  const dark = buildEmail(sigRequest({ brand: { ...BRAND, primary_color: "#1e3a8a" } }), OPTS);
  assertStringIncludes(dark.html, "color:#ffffff;text-decoration:none");
});

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

Deno.test("the four subjects", () => {
  assertEquals(buildEmail(sigRequest(), OPTS).subject, "Signature requested: COR #7 — Tower A");
  assertEquals(buildEmail(signed(), OPTS).subject, "Signed: COR #7 by Grace Contractor");
  assertEquals(buildEmail(ticket(), OPTS).subject, "New T&M ticket: Tower A — Nov 5, 2026");
  assertEquals(buildEmail(testCtx(), OPTS).subject, "FieldSync email test");
});

Deno.test("subjects collapse newlines from user data", () => {
  const email = buildEmail(
    sigRequest({
      document: { ...sigRequest().document, document_label: "COR\r\n#7" },
    }),
    OPTS,
  );
  assertEquals(email.subject, "Signature requested: COR #7 — Tower A");
});

// ---------------------------------------------------------------------------
// signature_request
// ---------------------------------------------------------------------------

Deno.test("signature_request: CTA to appBaseUrl/sign/token, total, expiry, reply_to", () => {
  const email = buildEmail(sigRequest(), OPTS);
  const url = "https://app.example.com/sign/sig_abc123";
  assertStringIncludes(email.html, `href="${url}"`);
  assertStringIncludes(email.html, "Review and sign");
  assertStringIncludes(email.html, "$1,234.50");
  assertStringIncludes(email.html, "This link expires on Nov 12, 2026.");
  assertStringIncludes(email.html, "Olivia Office at Acme Electric");
  assertStringIncludes(email.html, "Tower A (Job #J-1042)");
  assertStringIncludes(email.html, "Hi Grace Contractor,");
  assertEquals(email.reply_to, "office@acme.example");
  assertEquals(email.from, "Acme Electric via FieldSync <noreply@mail.example.com>");
});

Deno.test("signature_request: a trailing slash on appBaseUrl does not double up", () => {
  const email = buildEmail(sigRequest(), { ...OPTS, appBaseUrl: "https://app.example.com/" });
  assertStringIncludes(email.html, `href="https://app.example.com/sign/sig_abc123"`);
});

Deno.test("signature_request: expiry sentence only when expires_at is set", () => {
  const base = sigRequest();
  const email = buildEmail(sigRequest({ document: { ...base.document, expires_at: null } }), OPTS);
  assert(!email.html.includes("expires"), "no expiry sentence in html");
  assert(!email.text.includes("expires"), "no expiry sentence in text");
  assertStringIncludes(buildEmail(base, OPTS).text, "This link expires on Nov 12, 2026.");
});

Deno.test("signature_request: total omitted when cor_total_cents is absent", () => {
  const base = sigRequest();
  const email = buildEmail(
    sigRequest({
      document: { ...base.document, document_type: "tm_ticket", cor_total_cents: null },
    }),
    OPTS,
  );
  assert(!email.html.includes("Total:"), "no total line");
  assertStringIncludes(email.html, "T&amp;M ticket COR #7");
});

Deno.test("signature_request: user-supplied values are HTML-escaped", () => {
  const base = sigRequest();
  const email = buildEmail(
    sigRequest({
      to_name: `<script>alert(1)</script>`,
      brand: { ...BRAND, company_name: `Bob's <b>Bolts</b>` },
      project: { name: `Tower "A" & B`, job_number: null },
      document: { ...base.document, document_label: "<img src=x onerror=alert(1)>" },
    }),
    OPTS,
  );
  assert(!email.html.includes("<script>"), "script tag escaped");
  assert(!email.html.includes("<img src=x"), "label escaped");
  assert(!email.html.includes("<b>Bolts</b>"), "company escaped");
  assertStringIncludes(email.html, "&lt;script&gt;alert(1)&lt;/script&gt;");
  assertStringIncludes(email.html, "Bob&#39;s &lt;b&gt;Bolts&lt;/b&gt;");
  assertStringIncludes(email.html, "Tower &quot;A&quot; &amp; B");
});

Deno.test("signature_request: the token is URL-encoded in the link", () => {
  const base = sigRequest();
  const email = buildEmail(
    sigRequest({ document: { ...base.document, signature_token: `a"b c` } }),
    OPTS,
  );
  assertStringIncludes(email.html, `href="https://app.example.com/sign/a%22b%20c"`);
});

Deno.test("signature_request without a token is a template error", () => {
  const base = sigRequest();
  assertThrows(
    () => buildEmail(sigRequest({ document: { ...base.document, signature_token: "" } }), OPTS),
    TemplateError,
  );
});

Deno.test("invalid reply_to is dropped", () => {
  assertEquals(buildEmail(sigRequest({ reply_to: "not-an-email" }), OPTS).reply_to, undefined);
  assertEquals(buildEmail(sigRequest({ reply_to: null }), OPTS).reply_to, undefined);
});

// ---------------------------------------------------------------------------
// document_signed
// ---------------------------------------------------------------------------

Deno.test("document_signed: signer details, status and dashboard link", () => {
  const email = buildEmail(signed(), OPTS);
  assertStringIncludes(
    email.html,
    "Grace Contractor, PM (Builder Co) signed change order request COR #7",
  );
  assertStringIncludes(email.html, "Nov 5, 2026 at 3:04 PM UTC");
  assertStringIncludes(email.html, "Current status: <strong>Approved</strong>");
  assertStringIncludes(email.html, `href="https://app.example.com/"`);
  assertEquals(email.reply_to, undefined);
});

// ---------------------------------------------------------------------------
// tm_ticket_submitted
// ---------------------------------------------------------------------------

Deno.test("tm_ticket_submitted: workers table keeps the given order", () => {
  const email = buildEmail(ticket(), OPTS);
  const zed = email.html.indexOf("Zed Last");
  const amy = email.html.indexOf("Amy First");
  const mo = email.html.indexOf("Mo Middle");
  assert(zed > 0 && amy > zed && mo > amy, "html rows in input order");
  const tz = email.text.indexOf("Zed Last");
  const ta = email.text.indexOf("Amy First");
  const tm = email.text.indexOf("Mo Middle");
  assert(tz > 0 && ta > tz && tm > ta, "text rows in input order");
  assertStringIncludes(email.text, "- Amy First (Apprentice): 7.5 h, 0 OT");
  assertStringIncludes(email.text, "Total: 21.5 h, 2 OT");
});

Deno.test("tm_ticket_submitted: counts, CE/PCO, notes and link", () => {
  const email = buildEmail(ticket(), OPTS);
  assertStringIncludes(email.html, "3 workers · 1 item · 3 photos");
  assertStringIncludes(email.html, "PCO-12");
  assertStringIncludes(email.html, "Pulled wire<br>floor 3");
  assertStringIncludes(
    email.html,
    "Frank Foreman submitted a T&amp;M ticket for Tower A (work date Nov 5, 2026).",
  );
  assertStringIncludes(email.html, `href="https://app.example.com/"`);
  assertStringIncludes(email.text, "https://app.example.com/");
  assertStringIncludes(email.html, "Hello,");
});

Deno.test("tm_ticket_submitted: no workers renders no table", () => {
  const base = ticket();
  const email = buildEmail(
    ticket({
      document: { ...base.document, workers: [], photo_count: 1, item_count: 0, notes: null },
    }),
    OPTS,
  );
  assert(!email.html.includes("<th"), "no table header");
  assertStringIncludes(email.html, "0 workers · 0 items · 1 photo");
  assert(!email.html.includes("Notes:"), "no notes block");
});

// ---------------------------------------------------------------------------
// White-labelling and text alternatives
// ---------------------------------------------------------------------------

Deno.test("no FieldSync anywhere when the company hides FieldSync branding", () => {
  const hidden = { ...BRAND, hide_fieldsync_branding: true };
  for (
    const ctx of [
      sigRequest({ brand: hidden }),
      signed({ brand: hidden }),
      ticket({ brand: hidden }),
    ]
  ) {
    const email = buildEmail(ctx, OPTS);
    for (const part of [email.from, email.subject, email.html, email.text]) {
      assert(
        !part.includes("FieldSync"),
        `${ctx.event_type}: found FieldSync in ${part.slice(0, 80)}`,
      );
    }
    assertStringIncludes(email.html, "Sent on behalf of Acme Electric.");
    assertEquals(email.from, "Acme Electric <noreply@mail.example.com>");
  }
});

Deno.test("every email has a plain-text alternative containing its URL", () => {
  const cases: Array<[string, ReturnType<typeof buildEmail>]> = [
    ["https://app.example.com/sign/sig_abc123", buildEmail(sigRequest(), OPTS)],
    ["https://app.example.com/", buildEmail(signed(), OPTS)],
    ["https://app.example.com/", buildEmail(ticket(), OPTS)],
    ["https://app.example.com/", buildEmail(testCtx(), OPTS)],
  ];
  for (const [url, email] of cases) {
    assert(email.text.length > 0, "text exists");
    assertStringIncludes(email.text, url);
    assert(!email.text.includes("<"), "text has no HTML");
  }
});

Deno.test("test template uses the platform brand", () => {
  const email = buildEmail(testCtx(), OPTS);
  assertStringIncludes(email.html, "This is a test email from FieldSync.");
  assertEquals(email.from, "FieldSync <noreply@mail.example.com>");
});

Deno.test("unknown event types throw a TemplateError", () => {
  assertThrows(
    () => buildEmail({ event_type: "nope", to_email: "x@y.z" } as unknown as TestContext, OPTS),
    TemplateError,
    "unknown event_type",
  );
});
