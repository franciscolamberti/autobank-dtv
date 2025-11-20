// Supabase Edge Function: kapso-message-failed
// Handles Kapso v2 webhooks for whatsapp.message.failed
// - Verifies HMAC-SHA256 signature (X-Webhook-Signature)
// - For each payload, finds latest persona by telefono_principal (created_at desc)
// - Updates estado_contacto = 'error_envio' and stores error in error_envio_kapso

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-event, x-webhook-batch, x-idempotency-key",
};

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifySignature(
  rawBody: string,
  headerSig: string | null,
  secret: string | null
): Promise<boolean> {
  if (!headerSig || !secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedHex = toHex(
    await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody))
  );

  const provided = headerSig.trim().toLowerCase();
  const expected = expectedHex.toLowerCase();
  if (provided.length !== expected.length) return false;

  // Constant-time comparison
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return ok === 0;
}

type FailedPayload = {
  message?: {
    id?: string;
    kapso?: {
      status?: string; // "failed"
      error?: unknown;
    };
    // other WA message fields...
  };
  conversation?: {
    phone_number?: string; // E.164
    phone_number_id?: string;
  };
  phone_number_id?: string; // v2: duplicated at top level
};

function extractPhone(p: FailedPayload): string | null {
  return p?.conversation?.phone_number || null;
}

// Build phone candidates to match DB format.
// - Ensures '+' prefix
// - Adds/Removes the Argentina mobile '9' after +54 to try both variants
//   Example: Kapso '541139099780' -> ['+541139099780', '+5491139099780']
function buildPhoneCandidates(raw: string): string[] {
  if (!raw) return [];
  let s = String(raw).trim();
  // Keep only leading '+' and digits
  s = s.replace(/[^\d+]/g, "");
  if (!s.startsWith("+")) {
    // Convert 00xx to +xx, else just add '+'
    if (s.startsWith("00")) s = `+${s.slice(2)}`;
    else s = `+${s}`;
  }
  const out = new Set<string>();
  out.add(s);
  if (s.startsWith("+54")) {
    if (s.startsWith("+549")) {
      // Variant without '9'
      out.add("+54" + s.slice("+549".length));
    } else {
      // Variant with '9'
      out.add("+549" + s.slice("+54".length));
    }
  }
  return Array.from(out);
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const raw = await req.text();
    const event = req.headers.get("x-webhook-event") || "";
    const sig = req.headers.get("x-webhook-signature");
    const secret = Deno.env.get("KAPSO_WEBHOOK_SECRET") || "";
    const isBatchHeader = req.headers.get("x-webhook-batch") === "true";
    const idemKey = req.headers.get("x-idempotency-key") || "";
    const contentLen = raw.length;

    // Minimal but helpful request logs (payload visibility is mandatory, truncate to avoid noise)
    console.log(
      `[kapso-message-failed] recv event=${event} batch=${isBatchHeader} idem=${idemKey} len=${contentLen}`
    );

    //  Verify signature (Kapso: HMAC-SHA256 over raw JSON body)
    const valid = await verifySignature(raw, sig, secret);
    if (!valid) {
      console.warn("[kapso-message-failed] signature=invalid");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("[kapso-message-failed] signature=valid");

    // Only handle message.failed
    if (event !== "whatsapp.message.failed") {
      return new Response(JSON.stringify({ ok: true, ignored: true, event }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = JSON.parse(raw);
    const isBatch = isBatchHeader;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    async function processOne(payload: FailedPayload) {
      const phone = extractPhone(payload);
      if (!phone) {
        console.warn("[kapso-message-failed] skip: missing phone_number");
        return { ok: false, reason: "missing phone_number" };
      }
      const candidates = buildPhoneCandidates(phone);
      console.log(
        `[kapso-message-failed] processing phone=${phone} candidates=${JSON.stringify(
          candidates
        )}`
      );

      const { data: persona, error: selErr } = await supabase
        .from("personas_contactar")
        .select("id")
        .in("telefono_principal", candidates)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (selErr) {
        console.error("[kapso-message-failed] select error:", selErr.message);
        return { ok: false, reason: `select error: ${selErr.message}` };
      }
      if (!persona) {
        console.warn("[kapso-message-failed] no persona found for phone");
        return { ok: false, reason: "no persona found" };
      }
      console.log(
        `[kapso-message-failed] persona match id=${persona.id} (latest by created_at)`
      );

      const { error: updErr } = await supabase
        .from("personas_contactar")
        .update({
          estado_contacto: "error_envio",
          tiene_whatsapp: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", persona.id);

      if (updErr) {
        console.error("[kapso-message-failed] update error:", updErr.message);
        return { ok: false, reason: `update error: ${updErr.message}` };
      }
      console.log(
        `[kapso-message-failed] updated persona id=${persona.id} estado_contacto=error_envio`
      );
      return { ok: true, persona_id: persona.id };
    }

    if (isBatch && Array.isArray(body)) {
      console.log(
        `[kapso-message-failed] processing batch size=${(body as unknown[]).length}`
      );
      const results: any[] = [];
      for (const p of body as FailedPayload[]) {
        results.push(await processOne(p));
      }
      const okCount = results.filter((r: any) => r.ok).length;
      console.log(
        `[kapso-message-failed] batch done ok=${okCount} fail=${results.length - okCount}`
      );
      return new Response(JSON.stringify({ ok: true, results }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      const result = await processOne(body as FailedPayload);
      console.log(
        `[kapso-message-failed] single done ok=${(result as any).ok ? 1 : 0}`
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    console.error("[kapso-message-failed] fatal:", err?.message || String(err));
    return new Response(
      JSON.stringify({ error: err?.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
