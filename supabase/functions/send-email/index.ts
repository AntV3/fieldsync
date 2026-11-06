// send-email: drains the email_outbox table and delivers each row through Resend.
//
// Called by the database (pg_net from the enqueue trigger and the pg_cron sweep)
// with the shared worker secret, never by browsers. Deployed with
// verify_jwt = false (supabase/config.toml); the secret check below is the only gate.
//
// Request:  POST, header x-email-worker-secret, body { outbox_id?, drain?, test_to? }
// Response: { processed, sent, failed, deferred, cancelled, dead, skipped }

import { createClient } from "@supabase/supabase-js";
import { buildEmail, type EmailContext, TemplateError } from "./templates.ts";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const DUE_BATCH_SIZE = 25;
const RESEND_TIMEOUT_MS = 10_000;
const MAX_ERROR_LENGTH = 500;

export interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult>;
}

export interface Deps {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  createClient: (url: string, serviceRoleKey: string) => RpcClient;
}

export interface Summary {
  processed: number;
  sent: number;
  failed: number;
  deferred: number;
  cancelled: number;
  dead: number;
  skipped: number;
}

type Outcome = "skipped" | "sent" | "failed" | "deferred" | "cancelled" | "dead";

interface SendConfig {
  resendApiKey: string;
  emailFrom: string;
  appBaseUrl: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

function defaultCreateClient(url: string, serviceRoleKey: string): RpcClient {
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
  };
}

export const defaultDeps: Deps = {
  env: (key) => Deno.env.get(key),
  fetch: (input, init) => fetch(input, init),
  createClient: defaultCreateClient,
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function truncate(message: string): string {
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH - 1)}…` : message;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Constant-time string comparison (hashes both sides so length is not leaked either). */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/** email_outbox_due returns SETOF uuid; supabase-js may hand back strings or row objects. */
export function normalizeIds(data: unknown): string[] {
  if (data === null || data === undefined) return [];
  const list = Array.isArray(data) ? data : [data];
  const ids: string[] = [];
  for (const entry of list) {
    if (typeof entry === "string") {
      ids.push(entry);
    } else if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const preferred = record.email_outbox_due ?? record.id;
      const value = typeof preferred === "string"
        ? preferred
        : Object.values(record).find((v) => typeof v === "string");
      if (typeof value === "string") ids.push(value);
    }
  }
  return ids;
}

/**
 * claim_email_outbox returns the claimed row or NULL. A NULL composite can come back through
 * PostgREST as an object whose fields are all null (or as an empty array), so treat those as
 * "not claimed" too.
 */
export function isClaimed(data: unknown): boolean {
  if (data === null || data === undefined || data === false) return false;
  if (Array.isArray(data)) return data.length > 0 && isClaimed(data[0]);
  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    if ("id" in record) return record.id !== null && record.id !== undefined;
    return Object.values(record).some((v) => v !== null && v !== undefined);
  }
  return true;
}

interface ResendResult {
  outcome: "sent" | "failed" | "dead";
  providerMessageId: string | null;
  error: string | null;
}

export async function sendViaResend(
  deps: Deps,
  apiKey: string,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<ResendResult> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let res: Response;
  try {
    res = await deps.fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      outcome: "failed",
      providerMessageId: null,
      error: truncate(`network: ${errorMessage(err)}`),
    };
  }

  const raw = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    // Non-JSON error page; keep the raw text for last_error.
  }

  if (res.ok) {
    const id = typeof body.id === "string" ? body.id : null;
    return { outcome: "sent", providerMessageId: id, error: null };
  }

  const name = typeof body.name === "string" ? body.name : "";
  const message = typeof body.message === "string" ? body.message : raw.slice(0, 200);
  const errorText = truncate(`resend ${res.status}${name ? ` ${name}` : ""}: ${message}`.trim());

  if (res.status === 422 && name === "invalid_idempotent_request") {
    // Same Idempotency-Key with a different payload: the first attempt already went out.
    return { outcome: "sent", providerMessageId: null, error: "idempotent_replay" };
  }
  if (res.status === 409 || res.status === 429 || res.status >= 500) {
    return { outcome: "failed", providerMessageId: null, error: errorText };
  }
  return { outcome: "dead", providerMessageId: null, error: errorText };
}

async function mark(
  db: RpcClient,
  id: string,
  status: "sent" | "failed" | "dead" | "cancelled",
  providerMessageId: string | null,
  error: string | null,
): Promise<void> {
  const { error: rpcError } = await db.rpc("mark_email_outbox", {
    p_id: id,
    p_status: status,
    p_provider_message_id: providerMessageId,
    p_error: error,
  });
  if (rpcError) throw new Error(`mark_email_outbox(${status}) failed: ${rpcError.message}`);
}

export async function processOutboxRow(
  deps: Deps,
  db: RpcClient,
  config: SendConfig,
  id: string,
): Promise<Outcome> {
  let claimed = false;
  try {
    const claim = await db.rpc("claim_email_outbox", { p_id: id });
    if (claim.error) throw new Error(`claim_email_outbox failed: ${claim.error.message}`);
    if (!isClaimed(claim.data)) return "skipped";
    claimed = true;

    const context = await db.rpc("email_context", { p_id: id });
    if (context.error) throw new Error(`email_context failed: ${context.error.message}`);
    const ctx = context.data as (EmailContext & { defer?: boolean }) | { defer: true } | null;
    if (!ctx) {
      await mark(db, id, "cancelled", null, null);
      return "cancelled";
    }
    if ((ctx as { defer?: boolean }).defer === true) {
      await mark(db, id, "failed", null, "awaiting_workers");
      return "deferred";
    }

    const emailCtx = ctx as EmailContext;
    let email;
    try {
      email = buildEmail(emailCtx, {
        appBaseUrl: config.appBaseUrl,
        fromDefault: config.emailFrom,
      });
    } catch (err) {
      if (err instanceof TemplateError) {
        await mark(db, id, "dead", null, truncate(`template: ${err.message}`));
        return "dead";
      }
      throw err;
    }

    const result = await sendViaResend(deps, config.resendApiKey, {
      from: email.from,
      to: [emailCtx.to_email],
      ...(email.reply_to ? { reply_to: email.reply_to } : {}),
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [{ name: "event", value: emailCtx.event_type }],
    }, `outbox/${id}`);

    await mark(db, id, result.outcome, result.providerMessageId, result.error);
    if (result.outcome !== "sent") {
      console.error(`send-email: outbox ${id} ${result.outcome}: ${result.error}`);
    }
    return result.outcome;
  } catch (err) {
    const message = truncate(errorMessage(err));
    console.error(`send-email: outbox ${id} error: ${message}`);
    if (claimed) {
      try {
        await mark(db, id, "failed", null, message);
      } catch (markErr) {
        // The row stays 'sending'; the sweep reclaims it after the lock expires.
        console.error(
          `send-email: outbox ${id} could not be marked failed: ${errorMessage(markErr)}`,
        );
      }
    }
    return "failed";
  }
}

function missing(env: Deps["env"], keys: string[]): string[] {
  return keys.filter((k) => !env(k));
}

export async function handleRequest(req: Request, deps: Deps = defaultDeps): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
  }

  const expected = deps.env("EMAIL_WORKER_SECRET") ?? "";
  const provided = req.headers.get("x-email-worker-secret") ?? "";
  if (!expected || !provided || !(await timingSafeEqual(provided, expected))) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { outbox_id?: unknown; drain?: unknown; test_to?: unknown } = {};
  try {
    const raw = await req.text();
    if (raw.trim()) {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not an object");
      }
      body = parsed;
    }
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const missingSend = missing(deps.env, ["RESEND_API_KEY", "EMAIL_FROM", "APP_BASE_URL"]);
  if (missingSend.length) {
    console.error(`send-email: missing secrets: ${missingSend.join(", ")}`);
    return json({ error: "missing_configuration", missing: missingSend }, 500);
  }
  const config: SendConfig = {
    resendApiKey: deps.env("RESEND_API_KEY")!,
    emailFrom: deps.env("EMAIL_FROM")!,
    appBaseUrl: deps.env("APP_BASE_URL")!.replace(/\/+$/, ""),
  };

  const summary: Summary = {
    processed: 0,
    sent: 0,
    failed: 0,
    deferred: 0,
    cancelled: 0,
    dead: 0,
    skipped: 0,
  };

  // Smoke test: send the test template, touch no rows.
  if (body.test_to !== undefined) {
    const to = typeof body.test_to === "string" ? body.test_to.trim() : "";
    if (!EMAIL_RE.test(to)) return json({ error: "invalid_test_to" }, 400);
    const email = buildEmail({ event_type: "test", to_email: to, brand: null }, {
      appBaseUrl: config.appBaseUrl,
      fromDefault: config.emailFrom,
    });
    const result = await sendViaResend(deps, config.resendApiKey, {
      from: email.from,
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [{ name: "event", value: "test" }],
    });
    summary.processed = 1;
    if (result.outcome === "sent") summary.sent = 1;
    else if (result.outcome === "dead") summary.dead = 1;
    else summary.failed = 1;
    return json(
      { ...summary, provider_message_id: result.providerMessageId, error: result.error },
      result.outcome === "sent" ? 200 : 502,
    );
  }

  const missingDb = missing(deps.env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (missingDb.length) {
    console.error(`send-email: missing secrets: ${missingDb.join(", ")}`);
    return json({ error: "missing_configuration", missing: missingDb }, 500);
  }
  const db = deps.createClient(deps.env("SUPABASE_URL")!, deps.env("SUPABASE_SERVICE_ROLE_KEY")!);

  const ids: string[] = [];
  if (body.outbox_id !== undefined && body.outbox_id !== null) {
    if (typeof body.outbox_id !== "string" || !UUID_RE.test(body.outbox_id)) {
      return json({ error: "invalid_outbox_id" }, 400);
    }
    ids.push(body.outbox_id);
  }
  if (ids.length === 0 || body.drain === true) {
    const due = await db.rpc("email_outbox_due", { p_limit: DUE_BATCH_SIZE });
    if (due.error) {
      console.error(`send-email: email_outbox_due failed: ${due.error.message}`);
      return json({ error: "email_outbox_due_failed" }, 500);
    }
    for (const id of normalizeIds(due.data)) if (!ids.includes(id)) ids.push(id);
  }

  for (const id of ids) {
    const outcome = await processOutboxRow(deps, db, config, id);
    if (outcome === "skipped") {
      summary.skipped++;
      continue;
    }
    summary.processed++;
    summary[outcome]++;
  }

  return json(summary);
}

// Tests import this module with SEND_EMAIL_DISABLE_SERVE=1 so no server starts.
if (Deno.env.get("SEND_EMAIL_DISABLE_SERVE") !== "1") {
  Deno.serve((req) => handleRequest(req));
}
