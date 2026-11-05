import { assert, assertEquals } from "@std/assert";

// Importing index.ts must not start a server.
Deno.env.set("SEND_EMAIL_DISABLE_SERVE", "1");
const { handleRequest, isClaimed, normalizeIds, timingSafeEqual } = await import("./index.ts");
type Deps = import("./index.ts").Deps;
type RpcResult = import("./index.ts").RpcResult;

const SECRET = "s3cret-worker-value-0123456789abcdef";
const ID = "11111111-2222-4333-8444-555555555555";
const ID2 = "66666666-7777-4888-9999-aaaaaaaaaaaa";

const ENV: Record<string, string> = {
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "FieldSync <noreply@mail.example.com>",
  APP_BASE_URL: "https://app.example.com",
  EMAIL_WORKER_SECRET: SECRET,
  SUPABASE_URL: "https://ref.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
};

const CONTEXT = {
  event_type: "signature_request",
  to_email: "gc@builder.example",
  to_name: "Grace",
  reply_to: "office@acme.example",
  brand: {
    company_name: "Acme",
    logo_url: null,
    primary_color: null,
    hide_fieldsync_branding: false,
  },
  project: { name: "Tower A", job_number: "J-1" },
  document: {
    document_type: "cor",
    document_label: "COR #7",
    signature_token: "sig_abc",
    expires_at: null,
    requested_by_name: "Olivia",
    cor_total_cents: 1000,
  },
};

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

interface FetchCall {
  url: string;
  init: RequestInit;
}

function harness(opts: {
  env?: Record<string, string | undefined>;
  rpc?: Record<string, (args: Record<string, unknown>) => RpcResult>;
  fetchResponse?: () => Response | Promise<Response>;
} = {}) {
  const rpcCalls: RpcCall[] = [];
  const fetchCalls: FetchCall[] = [];
  const env = { ...ENV, ...(opts.env ?? {}) };
  const handlers: Record<string, (args: Record<string, unknown>) => RpcResult> = {
    email_outbox_due: () => ({ data: [], error: null }),
    claim_email_outbox: (args) => ({ data: { id: args.p_id, status: "sending" }, error: null }),
    email_context: () => ({ data: CONTEXT, error: null }),
    mark_email_outbox: () => ({ data: null, error: null }),
    ...(opts.rpc ?? {}),
  };
  const deps: Deps = {
    env: (k) => env[k],
    fetch: async (input, init) => {
      fetchCalls.push({ url: String(input), init: init ?? {} });
      return opts.fetchResponse
        ? await opts.fetchResponse()
        : new Response(JSON.stringify({ id: "re_msg_1" }), { status: 200 });
    },
    createClient: () => ({
      rpc: (fn, args) => {
        rpcCalls.push({ fn, args });
        const h = handlers[fn];
        return Promise.resolve(
          h ? h(args) : { data: null, error: { message: `no stub for ${fn}` } },
        );
      },
    }),
  };
  return { deps, rpcCalls, fetchCalls };
}

function post(body: unknown, secret: string | null = SECRET): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-email-worker-secret"] = secret;
  return new Request("http://localhost/send-email", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function marks(rpcCalls: RpcCall[]) {
  return rpcCalls.filter((c) => c.fn === "mark_email_outbox").map((c) => c.args);
}

Deno.test("timingSafeEqual", async () => {
  assert(await timingSafeEqual("abc", "abc"));
  assert(!(await timingSafeEqual("abc", "abd")));
  assert(!(await timingSafeEqual("abc", "abcd")));
});

Deno.test("normalizeIds accepts strings and row objects", () => {
  assertEquals(normalizeIds([ID, ID2]), [ID, ID2]);
  assertEquals(normalizeIds([{ email_outbox_due: ID }, { id: ID2 }]), [ID, ID2]);
  assertEquals(normalizeIds([{ other: ID }]), [ID]);
  assertEquals(normalizeIds(ID), [ID]);
  assertEquals(normalizeIds(null), []);
});

Deno.test("isClaimed treats null rows and all-null composites as not claimed", () => {
  assert(isClaimed({ id: ID, status: "sending" }));
  assert(isClaimed([{ id: ID }]));
  assert(isClaimed(true));
  assert(!isClaimed(null));
  assert(!isClaimed([]));
  assert(!isClaimed({ id: null, status: null }));
  assert(!isClaimed([{ id: null }]));
  assert(!isClaimed({ a: null }));
});

Deno.test("non-POST is 405", async () => {
  const { deps } = harness();
  const res = await handleRequest(new Request("http://localhost/send-email"), deps);
  assertEquals(res.status, 405);
  assertEquals(res.headers.get("allow"), "POST");
  await res.body?.cancel();
});

Deno.test("missing or wrong secret is 401, and 401 when the secret env is unset", async () => {
  for (
    const [secretHeader, envOverride] of [
      [null, {}],
      ["wrong", {}],
      [SECRET, { EMAIL_WORKER_SECRET: undefined }],
      ["", { EMAIL_WORKER_SECRET: "" }],
    ] as Array<[string | null, Record<string, string | undefined>]>
  ) {
    const { deps, rpcCalls, fetchCalls } = harness({ env: envOverride });
    const res = await handleRequest(post({ outbox_id: ID }, secretHeader), deps);
    assertEquals(res.status, 401);
    await res.body?.cancel();
    assertEquals(rpcCalls.length, 0);
    assertEquals(fetchCalls.length, 0);
  }
});

Deno.test("invalid JSON is 400", async () => {
  const { deps } = harness();
  const res = await handleRequest(post("{nope"), deps);
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test("missing Resend configuration is 500 and names the keys", async () => {
  const { deps } = harness({ env: { RESEND_API_KEY: undefined } });
  const res = await handleRequest(post({ drain: true }), deps);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).missing, ["RESEND_API_KEY"]);
});

Deno.test("test_to sends the test template and touches no rows", async () => {
  const { deps, rpcCalls, fetchCalls } = harness();
  const res = await handleRequest(post({ test_to: "me@example.com" }), deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.sent, 1);
  assertEquals(body.provider_message_id, "re_msg_1");
  assertEquals(rpcCalls.length, 0);
  assertEquals(fetchCalls.length, 1);
  const payload = JSON.parse(String(fetchCalls[0].init.body));
  assertEquals(payload.to, ["me@example.com"]);
  assertEquals(payload.subject, "FieldSync email test");
  assertEquals(payload.tags, [{ name: "event", value: "test" }]);
  const headers = new Headers(fetchCalls[0].init.headers);
  assertEquals(headers.get("authorization"), "Bearer re_test_key");
  assertEquals(headers.get("idempotency-key"), null);
});

Deno.test("test_to with a bad address is 400", async () => {
  const { deps, fetchCalls } = harness();
  const res = await handleRequest(post({ test_to: "nope" }), deps);
  assertEquals(res.status, 400);
  await res.body?.cancel();
  assertEquals(fetchCalls.length, 0);
});

Deno.test("outbox_id: claim, context, Resend with idempotency key, mark sent", async () => {
  const { deps, rpcCalls, fetchCalls } = harness();
  const res = await handleRequest(post({ outbox_id: ID }), deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.processed, 1);
  assertEquals(body.sent, 1);
  assertEquals(rpcCalls.map((c) => c.fn), [
    "claim_email_outbox",
    "email_context",
    "mark_email_outbox",
  ]);
  assertEquals(rpcCalls[0].args, { p_id: ID });
  assertEquals(marks(rpcCalls), [{
    p_id: ID,
    p_status: "sent",
    p_provider_message_id: "re_msg_1",
    p_error: null,
  }]);

  assertEquals(fetchCalls[0].url, "https://api.resend.com/emails");
  const headers = new Headers(fetchCalls[0].init.headers);
  assertEquals(headers.get("idempotency-key"), `outbox/${ID}`);
  const payload = JSON.parse(String(fetchCalls[0].init.body));
  assertEquals(payload.from, "Acme via FieldSync <noreply@mail.example.com>");
  assertEquals(payload.to, ["gc@builder.example"]);
  assertEquals(payload.reply_to, "office@acme.example");
  assertEquals(payload.subject, "Signature requested: COR #7 — Tower A");
  assertEquals(payload.tags, [{ name: "event", value: "signature_request" }]);
  assert(String(payload.html).includes("https://app.example.com/sign/sig_abc"));
  assert(String(payload.text).includes("https://app.example.com/sign/sig_abc"));
});

Deno.test("drain processes email_outbox_due ids (object rows) and dedupes with outbox_id", async () => {
  const { deps, rpcCalls } = harness({
    rpc: {
      email_outbox_due: () => ({
        data: [{ email_outbox_due: ID }, { email_outbox_due: ID2 }],
        error: null,
      }),
    },
  });
  const res = await handleRequest(post({ outbox_id: ID, drain: true }), deps);
  const body = await res.json();
  assertEquals(body.processed, 2);
  assertEquals(body.sent, 2);
  assertEquals(rpcCalls.find((c) => c.fn === "email_outbox_due")?.args, { p_limit: 25 });
  assertEquals(rpcCalls.filter((c) => c.fn === "claim_email_outbox").map((c) => c.args.p_id), [
    ID,
    ID2,
  ]);
});

Deno.test("empty body drains", async () => {
  const { deps, rpcCalls } = harness({
    rpc: { email_outbox_due: () => ({ data: [ID], error: null }) },
  });
  const res = await handleRequest(post(""), deps);
  assertEquals((await res.json()).sent, 1);
  assertEquals(rpcCalls[0].fn, "email_outbox_due");
});

Deno.test("claim returning null skips the row", async () => {
  const { deps, rpcCalls, fetchCalls } = harness({
    rpc: { claim_email_outbox: () => ({ data: null, error: null }) },
  });
  const body = await (await handleRequest(post({ outbox_id: ID }), deps)).json();
  assertEquals(body.processed, 0);
  assertEquals(body.skipped, 1);
  assertEquals(rpcCalls.map((c) => c.fn), ["claim_email_outbox"]);
  assertEquals(fetchCalls.length, 0);
});

Deno.test("null context cancels; defer marks failed awaiting_workers", async () => {
  const cancel = harness({ rpc: { email_context: () => ({ data: null, error: null }) } });
  const c = await (await handleRequest(post({ outbox_id: ID }), cancel.deps)).json();
  assertEquals(c.cancelled, 1);
  assertEquals(marks(cancel.rpcCalls), [{
    p_id: ID,
    p_status: "cancelled",
    p_provider_message_id: null,
    p_error: null,
  }]);
  assertEquals(cancel.fetchCalls.length, 0);

  const defer = harness({ rpc: { email_context: () => ({ data: { defer: true }, error: null }) } });
  const d = await (await handleRequest(post({ outbox_id: ID }), defer.deps)).json();
  assertEquals(d.deferred, 1);
  assertEquals(marks(defer.rpcCalls), [
    { p_id: ID, p_status: "failed", p_provider_message_id: null, p_error: "awaiting_workers" },
  ]);
  assertEquals(defer.fetchCalls.length, 0);
});

Deno.test("422 invalid_idempotent_request is marked sent as idempotent_replay", async () => {
  const { deps, rpcCalls } = harness({
    fetchResponse: () =>
      new Response(
        JSON.stringify({ statusCode: 422, name: "invalid_idempotent_request", message: "changed" }),
        {
          status: 422,
        },
      ),
  });
  const body = await (await handleRequest(post({ outbox_id: ID }), deps)).json();
  assertEquals(body.sent, 1);
  assertEquals(marks(rpcCalls), [{
    p_id: ID,
    p_status: "sent",
    p_provider_message_id: null,
    p_error: "idempotent_replay",
  }]);
});

Deno.test("409, 429 and 5xx are retryable failures", async () => {
  for (
    const [status, name] of [
      [409, "concurrent_idempotent_requests"],
      [429, "rate_limit_exceeded"],
      [503, "application_error"],
    ] as const
  ) {
    const { deps, rpcCalls } = harness({
      fetchResponse: () => new Response(JSON.stringify({ name, message: "try later" }), { status }),
    });
    const body = await (await handleRequest(post({ outbox_id: ID }), deps)).json();
    assertEquals(body.failed, 1, `status ${status}`);
    const m = marks(rpcCalls)[0];
    assertEquals(m.p_status, "failed");
    assertEquals(m.p_error, `resend ${status} ${name}: try later`);
  }
});

Deno.test("other 4xx is dead", async () => {
  const { deps, rpcCalls } = harness({
    fetchResponse: () =>
      new Response(JSON.stringify({ name: "validation_error", message: "Invalid `to` field" }), {
        status: 422,
      }),
  });
  const body = await (await handleRequest(post({ outbox_id: ID }), deps)).json();
  assertEquals(body.dead, 1);
  assertEquals(body.processed, 1);
  assertEquals(marks(rpcCalls)[0].p_status, "dead");
  assertEquals(marks(rpcCalls)[0].p_error, "resend 422 validation_error: Invalid `to` field");
});

Deno.test("network errors are retryable failures", async () => {
  const { deps, rpcCalls } = harness({
    fetchResponse: () => {
      throw new TypeError("connection reset");
    },
  });
  const body = await (await handleRequest(post({ outbox_id: ID }), deps)).json();
  assertEquals(body.failed, 1);
  assertEquals(marks(rpcCalls)[0], {
    p_id: ID,
    p_status: "failed",
    p_provider_message_id: null,
    p_error: "network: connection reset",
  });
});

Deno.test("an error on one row does not stop the next", async () => {
  let n = 0;
  const { deps, rpcCalls } = harness({
    rpc: {
      email_outbox_due: () => ({ data: [ID, ID2], error: null }),
      email_context: () => (n++ === 0
        ? { data: null, error: { message: "boom" } }
        : { data: CONTEXT, error: null }),
    },
  });
  const body = await (await handleRequest(post({ drain: true }), deps)).json();
  assertEquals(body.failed, 1);
  assertEquals(body.sent, 1);
  const m = marks(rpcCalls);
  assertEquals(m[0].p_status, "failed");
  assertEquals(m[0].p_error, "email_context failed: boom");
  assertEquals(m[1].p_status, "sent");
});

Deno.test("a context the templates cannot render is dead", async () => {
  const { deps, rpcCalls, fetchCalls } = harness({
    rpc: { email_context: () => ({ data: { ...CONTEXT, event_type: "mystery" }, error: null }) },
  });
  const body = await (await handleRequest(post({ outbox_id: ID }), deps)).json();
  assertEquals(body.dead, 1);
  assertEquals(marks(rpcCalls)[0].p_status, "dead");
  assertEquals(fetchCalls.length, 0);
});

Deno.test("invalid outbox_id is 400", async () => {
  const { deps, rpcCalls } = harness();
  const res = await handleRequest(post({ outbox_id: "not-a-uuid" }), deps);
  assertEquals(res.status, 400);
  await res.body?.cancel();
  assertEquals(rpcCalls.length, 0);
});
