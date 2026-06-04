import { createClient } from 'jsr:@supabase/supabase-js@2';

// Issues a short-lived signed URL for a curated MIDI stored in a PRIVATE bucket.
// The bucket has no public read policy, so the only way to fetch a curated file
// is through this function. That stops bulk scraping via the storage API: an
// attacker can't list or guess-download the bucket directly.
//
// Note on threat model: the curated filenames ship in the frontend bundle, so
// the filename allowlist here is hardening (block path traversal, refuse to sign
// anything that isn't a plain .mid at the bucket root), NOT secrecy. The real
// anti-scrape layers are: (1) the private bucket, (2) the short TTL, and
// (3) rate limiting (add a per-IP limit here when you want to harden further).

const BUCKET = 'midi-files';
const SIGNED_URL_TTL_SECONDS = 60;

// Rate limit knobs. Defaults to 15 requests / 60s per IP — generous enough that
// no human browsing the library hits it, tight enough to slow a scraper. Change
// without redeploying code via:
//   supabase secrets set CURATED_RATE_LIMIT_MAX=50
const RATE_LIMIT_MAX = Number(Deno.env.get('CURATED_RATE_LIMIT_MAX') ?? '15');
const RATE_LIMIT_WINDOW_SECONDS = Number(
  Deno.env.get('CURATED_RATE_LIMIT_WINDOW_SECONDS') ?? '60',
);

// Plain filename at the bucket root: letters, digits, dot, dash, underscore,
// ending in .mid or .midi. Rejects slashes and "..", so no path traversal and
// no signing of nested objects in other folders.
const SAFE_FILENAME = /^[A-Za-z0-9._-]+\.midi?$/;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let filename: unknown;
  try {
    ({ filename } = await req.json());
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof filename !== 'string' || !SAFE_FILENAME.test(filename)) {
    return json({ error: 'Invalid filename' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Per-IP rate limit. FAIL-OPEN: if the check itself errors (DB hiccup), we let
  // the request through — the anti-abuse layer must never take down a free
  // feature. We only reject when we positively get back `false`.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
    p_ip: ip,
    p_limit: RATE_LIMIT_MAX,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  if (rlError) {
    console.error('Rate limit check failed, allowing request:', rlError.message);
  } else if (allowed === false) {
    return json({ error: 'Too many requests — slow down a moment.' }, 429);
  }

  const { data, error } = await supabase
    .storage
    .from(BUCKET)
    .createSignedUrl(filename, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    return json({ error: 'Could not sign requested file' }, 404);
  }

  return json({ signedUrl: data.signedUrl }, 200);
});
