import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

// Load .env (локально только)
try {
  await Deno.stat(".env");
  await load({ export: true });
  console.log("✅ .env loaded");
} catch {
  console.log("ℹ️ Using Deno Deploy env vars");
}

const PORT = 8000;
const SECRET_TOKEN = Deno.env.get("SECRET_TOKEN");

if (!SECRET_TOKEN) {
  console.error("ERROR: SECRET_TOKEN not set");
  Deno.exit(1);
}

// —————————————————————————————————————————————
// 1. HTTP Server
// —————————————————————————————————————————————

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, (req) => {
  const url = new URL(req.url);

  // Health check (no auth)
  if (req.method === "GET" && url.pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Cron Wake-Up Service", { status: 200 });
});

console.log(`🚀 Server on port ${PORT}`);

// —————————————————————————————————————————————
// 2. Helpers
// —————————————————————————————————————————————

function getBearerHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${SECRET_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function wakeUpService(
  serviceName: string,
  url: string,
  maxJitterSeconds: number = 300
) {
  const jitterSeconds = Math.floor(Math.random() * (maxJitterSeconds + 1));
  console.log(`[WAKE-UP] ${serviceName} scheduled (+${jitterSeconds}s jitter)`);

  setTimeout(async () => {
    console.log(`[WAKE-UP] 🚀 ${serviceName}`);
    try {
      const res = await fetch(url, { method: "GET", headers: getBearerHeaders() });
      if (res.ok) {
        console.log(`✅ [WAKE-UP] ${serviceName} ok (${res.status})`);
      } else {
        console.warn(`⚠️ [WAKE-UP] ${serviceName}: ${res.status} ${await res.text()}`);
      }
    } catch (e) {
      console.error(`❌ [WAKE-UP] ${serviceName}: ${(e as Error).message}`);
    }
  }, jitterSeconds * 1000);
}

// —————————————————————————————————————————————
// 3. CRON: BazzarBizzar Wake-Up (every 12 min)
// —————————————————————————————————————————————

Deno.cron("BazzarBizzar Wake-Up", "*/12 * * * *", async () => {
  const BAZZAR_BIZZAR_WAKEUP_SERVICE = Deno.env.get("BAZZAR_BIZZAR_WAKEUP_SERVICE");
  if (!BAZZAR_BIZZAR_WAKEUP_SERVICE) {
    console.error("[CRON] ❌ Missing BAZZAR_BIZZAR_WAKEUP_SERVICE");
    return;
  }

  await wakeUpService(
    "BazzarBizzar",
    `${BAZZAR_BIZZAR_WAKEUP_SERVICE}/btc-price`,
    120
  );
});

console.log("✅ Cron tasks configured");

// —————————————————————————————————————————————
// 4. CRON: Kline Fetchers Wake-Up (every 12 min)
// —————————————————————————————————————————————

Deno.cron("BazzarKline Wake-Up", "*/12 * * * *", async () => {
  const BAZZAR_KLINE_FETCHER_URL = Deno.env.get("BAZZAR_KLINE_FETCHER_URL");
  if (!BAZZAR_KLINE_FETCHER_URL) {
    console.error("[CRON] ❌ Missing BAZZAR_KLINE_FETCHER_URL");
    return;
  }

  await wakeUpService(
    "BazzarKline",
    `${BAZZAR_KLINE_FETCHER_URL}/api/1h-btc-candle`,
    120
  );
});

Deno.cron("BizzarKline Wake-Up", "*/12 * * * *", async () => {
  const BIZZAR_KLINE_FETCHER_URL = Deno.env.get("BIZZAR_KLINE_FETCHER_URL");
  if (!BIZZAR_KLINE_FETCHER_URL) {
    console.error("[CRON] ❌ Missing BIZZAR_KLINE_FETCHER_URL");
    return;
  }

  await wakeUpService(
    "BizzarKline",
    `${BIZZAR_KLINE_FETCHER_URL}/api/1h-btc-candle`,
    120
  );
});



