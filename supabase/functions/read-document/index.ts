// Reads an uploaded PO or invoice (photo or PDF) and returns what is printed on it, as a draft for a person to check.
// Only signed-in people with Finance manage or "My PO orders" access may use it. Nothing about the document is stored:
// only who used it, when, the model and the token counts (table po_read_log), so spending can be watched and capped.
// Secrets: ANTHROPIC_API_KEY (required). Optional: READ_MODEL (default claude-opus-5-5), READ_DAILY_CAP (reads per person per day, default 60),
// READ_TOTAL_DAILY_CAP (all people, default 300).
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import { cleanInvoice, cleanPo, decodedSize, IMAGE_TYPES, INVOICE_PROMPT, INVOICE_SCHEMA, MAX_BYTES, PO_PROMPT, PO_SCHEMA } from "./schema.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const myt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  // ---- who is calling, and may they ----
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth.user) return json({ error: "You are not signed in." }, 401);
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const [mgr, mine] = await Promise.all([asUser.rpc("has_perm", { p: "finance_manage" }), asUser.rpc("has_perm", { p: "page_po_mine" })]);
  if (!mgr.data && !mine.data) return json({ error: "Your role cannot use the document reader." }, 403);

  // ---- the request ----
  let body: { kind?: string; mime?: string; data?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const kind = body.kind === "po" || body.kind === "invoice" ? body.kind : null;
  const mime = String(body.mime ?? "");
  const data = typeof body.data === "string" ? body.data : "";
  if (!kind) return json({ error: "Say whether this is a PO or an invoice." }, 400);
  if (mime !== "application/pdf" && !IMAGE_TYPES.includes(mime)) return json({ error: "Use a PDF or a photo (JPG, PNG)." }, 400);
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return json({ error: "The file could not be read." }, 400);
  if (decodedSize(data) > MAX_BYTES) return json({ error: "The file is too large to read. Use one under 4 MB, or a smaller photo." }, 413);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ code: "no_key", error: "The document reader is not switched on yet. Ask the owner to add the reader key." }, 503);

  // ---- spending caps ----
  const since = `${myt()}T00:00:00+08:00`;
  const perPerson = Number(Deno.env.get("READ_DAILY_CAP") ?? 60), total = Number(Deno.env.get("READ_TOTAL_DAILY_CAP") ?? 300);
  const [mineCount, allCount] = await Promise.all([
    admin.from("po_read_log").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).gte("created_at", since),
    admin.from("po_read_log").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  if ((mineCount.count ?? 0) >= perPerson) return json({ code: "cap", error: `You have used today's limit of ${perPerson} document reads. Type this one in, or try again tomorrow.` }, 429);
  if ((allCount.count ?? 0) >= total) return json({ code: "cap", error: "The company's daily limit of document reads has been reached. Type this one in, or try again tomorrow." }, 429);

  // ---- read it ----
  const model = Deno.env.get("READ_MODEL") ?? "claude-opus-5-5";
  const client = new Anthropic({ apiKey: key });
  const source = mime === "application/pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data } };

  let message: Awaited<ReturnType<typeof client.beta.messages.create>>;
  try {
    message = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: kind === "po" ? PO_PROMPT : INVOICE_PROMPT,
      output_config: { effort: "medium", format: { type: "json_schema", schema: kind === "po" ? PO_SCHEMA : INVOICE_SCHEMA } },
      messages: [{ role: "user", content: [source, { type: "text", text: "Read this document." }] }],
    });
  } catch (e) {
    const status = typeof (e as { status?: number }).status === "number" ? (e as { status: number }).status : 0;
    const text = status === 401 || status === 403 ? "The reader key is not accepted. Ask the owner to check it." : status === 429 ? "The reader is busy. Try again in a minute." : "The reader could not read this file. Type it in by hand.";
    await admin.from("po_read_log").insert({ user_id: auth.user.id, kind, model, ok: false, error: `status ${status}` });
    return json({ error: text }, status === 429 ? 429 : 502);
  }

  const usage = message.usage as { input_tokens?: number; output_tokens?: number };
  const log = (ok: boolean, error?: string) => admin.from("po_read_log").insert({ user_id: auth.user.id, kind, model, ok, error: error ?? null, input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null });

  if (message.stop_reason === "refusal") { await log(false, "refusal"); return json({ error: "The reader declined this file. Type it in by hand." }, 422); }
  if (message.stop_reason === "max_tokens") { await log(false, "max_tokens"); return json({ error: "This document is too long to read in one go. Type it in by hand." }, 422); }
  const block = message.content.find((b) => b.type === "text");
  let parsed: unknown;
  try { parsed = JSON.parse(block && block.type === "text" ? block.text : ""); } catch { await log(false, "bad_json"); return json({ error: "The reader gave an answer that could not be used. Try again, or type it in by hand." }, 502); }

  await log(true);
  return json({ ok: true, kind, data: kind === "po" ? cleanPo(parsed) : cleanInvoice(parsed) });
});
