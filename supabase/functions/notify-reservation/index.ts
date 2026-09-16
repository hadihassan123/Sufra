// Post-reserve notify shell (log-only / feature-flagged).
// Does NOT change stock, codes, or reservation status.
// Secrets (optional): NOTIFY_ENABLED=true|false  NOTIFY_MODE=log
// Default: disabled no-op so deploy is safe with zero config.

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type NotifyBody = {
  reservation_id?: string;
  phone?: string;
  pickup_code?: string;
  item_name?: string;
  vendor_name?: string;
  pickup_start?: string;
  pickup_end?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const enabled = (Deno.env.get('NOTIFY_ENABLED') || 'false').toLowerCase() === 'true';
  const mode = (Deno.env.get('NOTIFY_MODE') || 'log').toLowerCase();

  let body: NotifyBody = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Master switch — no side effects
  if (!enabled) {
    return new Response(
      JSON.stringify({ ok: true, mode: 'off', detail: 'NOTIFY_ENABLED is not true' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const summary = {
    mode,
    reservation_id: body.reservation_id ?? null,
    phone_last4: body.phone ? String(body.phone).slice(-4) : null,
    pickup_code: body.pickup_code ?? null,
    item_name: body.item_name ?? null,
    vendor_name: body.vendor_name ?? null,
    pickup_start: body.pickup_start ?? null,
    pickup_end: body.pickup_end ?? null,
  };

  if (mode === 'log') {
    console.log('[notify-reservation] would_notify', JSON.stringify(summary));
    return new Response(
      JSON.stringify({ ok: true, mode: 'log', detail: 'logged only; no SMS/WhatsApp sent' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Future: sms | whatsapp | telegram — not wired (no paid providers)
  console.log('[notify-reservation] unsupported_mode', mode, JSON.stringify(summary));
  return new Response(
    JSON.stringify({ ok: true, mode, detail: 'unsupported mode; no message sent' }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
