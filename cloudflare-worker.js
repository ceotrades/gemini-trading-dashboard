// GEMINI Trading Dashboard — Cloudflare Worker v2
// Routes:
//   POST /          → Anthropic API proxy
//   GET  /calendar  → ForexFactory economic calendar
//   GET  /prices    → Yahoo Finance batch quotes
//   GET  /news      → Yahoo Finance RSS headlines per symbol

// Only the dashboard may call this worker. The Anthropic route spends real
// money, so it also pins the model and caps the size of every request.
const ALLOWED_ORIGINS = [
  "https://geminiceo.netlify.app",
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 2000;
const MAX_BODY_BYTES = 32_000;

function allowedOrigin(origin) {
  if (!origin) return null;
  return ALLOWED_ORIGINS.some((o) => (typeof o === "string" ? o === origin : o.test(origin))) ? origin : null;
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request.headers.get("Origin"));

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin",
        },
      });
    }

    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": origin || "https://geminiceo.netlify.app",
      "Content-Type": "application/json",
      "Vary": "Origin",
    };

    // ── GET /calendar — ForexFactory live data ──────────────────────────────
    if (request.method === "GET" && url.pathname === "/calendar") {
      try {
        const endpoint = url.searchParams.get("week") === "next"
          ? "https://nfs.faireconomy.media/ff_calendar_nextweek.json"
          : "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

        const res = await fetch(endpoint, { headers: { "User-Agent": "Mozilla/5.0" } });
        const data = await res.json();

        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { ...corsHeaders, "Cache-Control": "max-age=1800" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: corsHeaders,
        });
      }
    }

    // ── GET /prices?symbols=EURUSD=X,GC=F,NQ=F — Yahoo Finance quotes ───────
    if (request.method === "GET" && url.pathname === "/prices") {
      try {
        const symbols = url.searchParams.get("symbols") || "EURUSD=X";
        const yhooRes = await fetch(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent`,
          { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "Accept": "application/json" } }
        );
        const raw = await yhooRes.text();
        let parsed;
        try { parsed = JSON.parse(raw); } catch { throw new Error("Yahoo returned non-JSON"); }

        const quotes = parsed?.quoteResponse?.result || [];
        const out = {};
        quotes.forEach(q => {
          if (q.symbol) {
            out[q.symbol] = {
              price: q.regularMarketPrice ?? null,
              changePercent: q.regularMarketChangePercent ?? 0,
            };
          }
        });

        return new Response(JSON.stringify(out), {
          status: 200,
          headers: { ...corsHeaders, "Cache-Control": "max-age=60" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: corsHeaders,
        });
      }
    }

    // ── GET /news?symbol=EURUSD=X — Yahoo Finance RSS headlines ─────────────
    if (request.method === "GET" && url.pathname === "/news") {
      try {
        const symbol = url.searchParams.get("symbol") || "EURUSD=X";
        const rssRes = await fetch(
          `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`,
          { headers: { "User-Agent": "Mozilla/5.0" } }
        );
        const xml = await rssRes.text();

        // Parse <title> tags — both CDATA and plain
        const headlines = [];
        const re = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g;
        let m;
        while ((m = re.exec(xml)) !== null) {
          const t = m[1].trim();
          // Skip the channel-level title (first <title> is the feed name)
          if (t && !t.toLowerCase().includes("yahoo finance") && headlines.length < 5) {
            headlines.push(t);
          }
        }

        return new Response(JSON.stringify({ headlines }), {
          status: 200,
          headers: { ...corsHeaders, "Cache-Control": "max-age=300" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ headlines: [], error: err.message }), {
          status: 200, headers: corsHeaders, // 200 so the app doesn't treat it as failure
        });
      }
    }

    // ── POST / — Anthropic API proxy ────────────────────────────────────────
    if (request.method === "POST") {
      // Browsers always send Origin on a cross-site POST, so a missing or
      // foreign one means the call didn't come from the dashboard.
      if (!origin) {
        return new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403, headers: corsHeaders });
      }
      try {
        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) {
          return new Response(JSON.stringify({ error: { message: "Request too large" } }), { status: 413, headers: corsHeaders });
        }
        const body = JSON.parse(raw);
        if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 4) {
          return new Response(JSON.stringify({ error: { message: "Bad request" } }), { status: 400, headers: corsHeaders });
        }

        // Forward only the fields the dashboard uses, with the model pinned
        // and the output capped, whatever the caller asked for.
        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: Math.min(Number(body.max_tokens) || 1500, MAX_TOKENS),
            ...(typeof body.system === "string" ? { system: body.system } : {}),
            messages: body.messages,
          }),
        });

        // Read body as text first so we can handle non-JSON error pages
        const responseText = await anthropicRes.text();
        let data;
        try {
          data = JSON.parse(responseText);
        } catch {
          // Anthropic returned HTML or plain text (e.g. deprecated model, outage)
          return new Response(
            JSON.stringify({ error: { message: `Anthropic API error (HTTP ${anthropicRes.status}): ${responseText.slice(0, 200)}` } }),
            { status: anthropicRes.status >= 400 ? anthropicRes.status : 502, headers: corsHeaders }
          );
        }

        return new Response(JSON.stringify(data), {
          status: anthropicRes.status,
          headers: corsHeaders,
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: { message: err.message } }), {
          status: 500, headers: corsHeaders,
        });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
