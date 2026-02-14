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

function getCoinSifterHeaders(): HeadersInit {
  return {
    "X-Auth-Token": SECRET_TOKEN!,
  };
}

async function wakeUpService(
  serviceName: string,
  url: string,
  isCoinSifter: boolean = false,
  maxJitterSeconds: number = 300
) {
  const jitterSeconds = Math.floor(Math.random() * (maxJitterSeconds + 1));
  console.log(`[WAKE-UP] ${serviceName} scheduled (+${jitterSeconds}s jitter)`);

  setTimeout(async () => {
    console.log(`[WAKE-UP] 🚀 ${serviceName}`);
    try {
      const headers = isCoinSifter
        ? getCoinSifterHeaders()
        : getBearerHeaders();

      const res = await fetch(url, { method: "GET", headers });
      if (res.ok) {
        console.log(`✅ [WAKE-UP] ${serviceName} ok (${res.status})`);
      } else {
        console.warn(
          `⚠️ [WAKE-UP] ${serviceName}: ${res.status} ${await res.text()}`
        );
      }
    } catch (e) {
      console.error(`❌ [WAKE-UP] ${serviceName}: ${(e as Error).message}`);
    }
  }, jitterSeconds * 1000);
}

async function runTask(
  serviceName: string,
  baseUrl: string,
  taskEndpoint: string
) {
  const url = `${baseUrl}${taskEndpoint}`;
  console.log(`[TASK] 🚀 ${serviceName}${taskEndpoint}`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: getBearerHeaders(),
    });

    if (res.status === 200) {
      console.log(`✅ [TASK] ${serviceName}${taskEndpoint} ok`);
    } else if (res.status === 409) {
      console.warn(`⚠️ [TASK] ${serviceName}${taskEndpoint} busy (409)`);
    } else if (res.status === 403) {
      console.error(`❌ [TASK] ${serviceName}${taskEndpoint} forbidden (403)`);
    } else {
      console.error(`❌ [TASK] ${serviceName}${taskEndpoint}: ${res.status}`);
    }
  } catch (e) {
    console.error(
      `❌ [TASK] ${serviceName}${taskEndpoint}: ${(e as Error).message}`
    );
  }
}

// —————————————————————————————————————————————
// 3. CRON: Wake-Up (every 10 min)
// —————————————————————————————————————————————

Deno.cron("Wake-Up all services", "*/10 * * * *", async () => {
  console.log("[CRON] ⏰ Wake-up cycle");

  const COIN_SIFTER_URL = Deno.env.get("COIN_SIFTER_URL");
  const BAZZAR_URL = Deno.env.get("BAZZAR_KLINE_DATA_URL");

  if (!COIN_SIFTER_URL || !BAZZAR_URL) {
    console.error("[CRON] ❌ Missing env vars");
    return;
  }

  await wakeUpService("CoinSifter", `${COIN_SIFTER_URL}/blacklist`, true);
  await wakeUpService("BAZZAR", `${BAZZAR_URL}/api/1h-btc-candle`);

  // await wakeUpService("MarketVibe", `${KLINE_DATA_URL}/api/1h-btc-candle`);
});

// —————————————————————————————————————————————
// 3.1 CRON: BizzarPrice Wake-Up (every 10-15 min)
// —————————————————————————————————————————————

Deno.cron("BizzarPrice Wake-Up", "*/12 * * * *", async () => {
  const BIZZAR_WAKE_UP_SERVICE = Deno.env.get("BIZZAR_WAKE_UP_SERVICE");
  if (!BIZZAR_WAKE_UP_SERVICE) {
    console.error("[CRON] ❌ Missing BIZZAR_WAKE_UP_SERVICE");
    return;
  }

  await wakeUpService(
    "BizzarPrice",
    `${BIZZAR_WAKE_UP_SERVICE}/btc-price`,
    false,
    120
  );
});

// —————————————————————————————————————————————
// 4. CRON: Data Collector Jobs
// —————————————————————————————————————————————

// --- ИЗМЕНЕНИЕ: Получаем оба URL ---
const BAZZAR_URL = Deno.env.get("BAZZAR_KLINE_DATA_URL");
// --- КОНЕЦ ИЗМЕНЕНИЯ ---

// 1h: most hours except 12 (BAZZAR)
Deno.cron(
  "Bazzar 1h Job",
  "0 1,2,3,4,5,6,7,8,9,10,11,13,14,15,16,17,18,19,20,21,22,23 * * *",
  async () => {
    if (BAZZAR_URL) {
      await runTask("BAZZAR", BAZZAR_URL, "/api/jobs/run/1h");
    }
  }
);

// 12h: 12:00 (BAZZAR)
Deno.cron("Bazzar 12h Job", "0 12 * * *", async () => {
  if (BAZZAR_URL) {
    await runTask("BAZZAR", BAZZAR_URL, "/api/jobs/run/12h");
  }
});

// 1d: 00:00 (BAZZAR)
Deno.cron("Bazzar 1d Job", "0 0 * * *", async () => {
  if (BAZZAR_URL) {
    await runTask("BAZZAR", BAZZAR_URL, "/api/jobs/run/1d");
  }
});

console.log("✅ Cron tasks configured");
