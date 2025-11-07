// main.ts — Deno-сервер + Cron (Пробуждение + Запуск Задач)

// —————————————————————————————————————————————
// 1. Автоматическая загрузка .env (только локально)
// —————————————————————————————————————————————
try {
  await Deno.stat(".env");
  const { load } = await import("https://deno.land/std@0.224.0/dotenv/mod.ts");
  await load({ export: true });
  console.log("✅ [ENV] .env загружен (локальный режим)");
} catch {
  // В Deno Deploy файловой системы нет — это нормально
}

// —————————————————————————————————————————————
// 2. Простейший HTTP-сервер
// —————————————————————————————————————————————
Deno.serve({ port: 8000, hostname: "0.0.0.0" }, (req) => {
  if (req.method === "GET" && req.url.endsWith("/health")) {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response("Hello from Deno Cron & Wake-Up Service!", {
    status: 200,
  });
});

console.log("🚀 [SERVER] Запущен на http://0.0.0.0:8000");
console.log("   Эндпоинт здоровья: GET /health");

// ============================================================================
// 3. Cron: ПРОБУЖДЕНИЕ внешних сервисов (каждые 10 минут)
// (Этот код полностью сохранен из вашего файла)
// ============================================================================
Deno.cron("Wake up external services", "*/10 * * * *", async () => {
  console.log("⏰ [CRON Wake-Up] Запуск задачи 'пробуждения'...");

  const COIN_SIFTER_URL = Deno.env.get("COIN_SIFTER_URL");
  const KLINE_PROVIDER_URL = Deno.env.get("KLINE_PROVIDER_URL");
  const SECRET_TOKEN = Deno.env.get("SECRET_TOKEN"); //

  if (!COIN_SIFTER_URL || !KLINE_PROVIDER_URL || !SECRET_TOKEN) {
    console.error("❌ [CRON Wake-Up] Ошибка: не заданы переменные окружения!");
    console.error(
      "   Проверьте: COIN_SIFTER_URL, KLINE_PROVIDER_URL, SECRET_TOKEN"
    );
    return;
  }

  const jitter1 = Math.floor(Math.random() * 201); // 0–200 сек
  const jitter2 = Math.floor(Math.random() * 201);

  console.log(
    `⏳ [CRON Wake-Up] Задержки: CoinSifter — ${jitter1}s, KlineProvider — ${jitter2}s`
  );

  // Пробуждение CoinSifter
  setTimeout(async () => {
    try {
      const res = await fetch(`${COIN_SIFTER_URL}/blacklist`, {
        //
        headers: { "X-Auth-Token": SECRET_TOKEN }, //
        method: "GET",
      });
      if (res.ok) {
        console.log("✅ [CRON Wake-Up] CoinSifter успешно разбужен (200 OK)");
      } else {
        console.warn(`⚠️ [CRON Wake-Up] CoinSifter ответил: ${res.status}`);
      }
    } catch (e) {
      console.error(
        `💥 [CRON Wake-Up] Ошибка при пробуждении CoinSifter: ${e.message}`
      );
    }
  }, jitter1 * 1000);

  // Пробуждение KlineProvider
  setTimeout(async () => {
    try {
      const res = await fetch(`${KLINE_PROVIDER_URL}/cache/global_fr`); //
      if (res.ok) {
        console.log(
          "✅ [CRON Wake-Up] KlineProvider успешно разбужен (200 OK)"
        );
      } else {
        console.warn(`⚠️ [CRON Wake-Up] KlineProvider ответил: ${res.status}`);
      }
    } catch (e) {
      console.error(
        `💥 [CRON Wake-Up] Ошибка при пробуждении KlineProvider: ${e.message}`
      );
    }
  }, jitter2 * 1000);
});

// ============================================================================
// 4. (НОВОЕ) Cron: ЗАПУСК ЗАДАЧ Data Collector
// ============================================================================

// --- Вспомогательная функция для Klines ---
async function runKlineTask(timeframe: string) {
  const KLINE_PROVIDER_URL = Deno.env.get("KLINE_PROVIDER_URL");
  if (!KLINE_PROVIDER_URL) {
    console.error(`❌ [CRON ${timeframe}] KLINE_PROVIDER_URL не найден!`);
    return;
  }

  console.log(`🚀 [CRON ${timeframe}] Запуск задачи сбора данных...`);
  try {
    const res = await fetch(`${KLINE_PROVIDER_URL}/get-market-data`, {
      //
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeframe: timeframe }),
    });

    if (res.status === 202) {
      console.log(
        `✅ [CRON ${timeframe}] Задача успешно принята сервером (202 Accepted)`
      );
    } else if (res.status === 409) {
      console.warn(
        `⚠️ [CRON ${timeframe}] Задача отклонена (409 Conflict). Воркер был занят.`
      );
    } else {
      console.error(
        `❌ [CRON ${timeframe}] Сервер вернул ошибку: ${
          res.status
        } ${await res.text()}`
      );
    }
  } catch (e) {
    console.error(
      `💥 [CRON ${timeframe}] Ошибка сети при запуске задачи: ${e.message}`
    );
  }
}

// --- Вспомогательная функция для FR ---
async function runFrTask() {
  const KLINE_PROVIDER_URL = Deno.env.get("KLINE_PROVIDER_URL");
  const SECRET_TOKEN = Deno.env.get("SECRET_TOKEN"); //
  if (!KLINE_PROVIDER_URL || !SECRET_TOKEN) {
    console.error(
      "❌ [CRON FR] KLINE_PROVIDER_URL или SECRET_TOKEN не найдены!"
    );
    return;
  }

  console.log("🚀 [CRON FR] Запуск задачи сбора FR...");
  try {
    const res = await fetch(`${KLINE_PROVIDER_URL}/api/v1/internal/update-fr`, {
      //
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET_TOKEN}`, //
      },
    });

    if (res.status === 202) {
      console.log("✅ [CRON FR] Задача FR успешно принята (202 Accepted)");
    } else if (res.status === 409) {
      console.warn(
        "⚠️ [CRON FR] Задача FR отклонена (409 Conflict). Воркер был занят."
      );
    } else {
      console.error(
        `❌ [CRON FR] Сервер вернул ошибку: ${res.status} ${await res.text()}`
      );
    }
  } catch (e) {
    console.error(`💥 [CRON FR] Ошибка сети при запуске задачи: ${e.message}`);
  }
}

// --- Определения Cron (по вашему расписанию) ---
// (ИЗМЕНЕНИЕ: Имена исправлены, двоеточие ':' заменено на тире '-')

// 1. ТФ 1 час (Каждый час в 00 минут)
Deno.cron("Task-1h", "0 * * * *", () => runKlineTask("1h"));

// 2. ТФ FR (Каждые 4 часа в 04 минуты)
Deno.cron("Task-FR", "4 */4 * * *", () => runFrTask());

// 3. ТФ 4 часа (Каждые 4 часа в 08 минут)
Deno.cron("Task-4h", "8 */4 * * *", () => runKlineTask("4h"));

// 4. ТФ 12 часов (Каждые 12 часов в 12 минут)
Deno.cron("Task-12h", "12 */12 * * *", () => runKlineTask("12h"));

// 5. ТФ 1 день (Каждый день в 00:15)
Deno.cron("Task-1d", "15 0 * * *", () => runKlineTask("1d"));

console.log(
  "✅ [CRON] Все 5 задач сбора данных (1h, 4h, 12h, 1d, FR) настроены."
);
