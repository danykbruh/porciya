// Порция — серверная функция ИИ (Supabase Edge Function, Deno).
// Сайт присылает сюда задачу (оценить блюдо, распознать фото, подобрать рецепт),
// функция проверяет вход и дневной лимит, сама собирает запрос к нейросети и возвращает JSON.
// Ключ нейросети хранится только в секретах Supabase (YANDEX_API_KEY) и никогда не попадает на сайт.
//
// Провайдер сейчас — Yandex AI Studio (OpenAI-совместимый API). Чтобы сменить провайдера,
// достаточно переписать функцию callModel() ниже.
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string, d = "") => (Deno.env.get(k) ?? d).trim();
const ALLOWED_ORIGINS = env("AI_ALLOWED_ORIGINS", "https://danykbruh.github.io").split(",").map((s) => s.trim());
const DAILY_LIMIT = Number(env("AI_DAILY_LIMIT", "30")) || 30; // запросов на пользователя в сутки (защита бюджета)
const TEXT_MODEL = env("AI_TEXT_MODEL", "yandexgpt/latest");
const VISION_MODEL = env("AI_VISION_MODEL", "qwen3.6-35b-a3b");
const MAX_IMAGE_CHARS = 4_000_000; // ~3 МБ картинки в base64; сайт заранее сжимает фото

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const reply = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

// ---------- Промпты: собираются только здесь, сайт присылает лишь данные ----------
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null; };

export function buildTask(task: string, b: Record<string, unknown>): { prompt: string; image?: string } | { error: string } {
  if (task === "estimate") {
    const name = str(b.name, 120);
    if (!name) return { error: "empty" };
    return { prompt: `Ты нутрициолог. Оцени пищевую ценность блюда или продукта по названию (русский язык).
Блюдо: """${name}"""
Ответь ТОЛЬКО JSON-объектом без пояснений:
{"kcal_per_100g": число (ккал на 100 г готового продукта, как в типичных таблицах калорийности),
 "protein_per_100g": число (г), "fat_per_100g": число (г), "carbs_per_100g": число (г),
 "typical_portion_g": число (обычная порция в граммах),
 "has_veg_or_fruit": true или false (есть ли в блюде заметная порция овощей или фруктов),
 "uncertainty_pct": число от 5 до 60 (насколько может ошибаться оценка калорий в процентах: 5–15 для однозначных продуктов вроде «банан», 20–40 для блюд, где рецепт сильно варьируется, 40–60 для расплывчатых названий),
 "confidence": "high" | "medium" | "low",
 "note": строка до 60 символов на русском (что именно ты посчитал) }
Если это не еда, верни {"kcal_per_100g": null, "note": "не похоже на еду"}.` };
  }
  if (task === "photo") {
    const image = typeof b.image === "string" ? b.image : "";
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE_CHARS) return { error: "bad_image" };
    const typed = str(b.typed, 120);
    return { image, prompt: `На фото — приём пищи. Определи, какие блюда и продукты на нём видны, оцени вес каждого в граммах (ориентируйся на размер тарелки, приборов, упаковки, типичные порции) и пищевую ценность именно этой порции.
${typed ? `Пользователь подписал блюдо так: """${typed}""". Учитывай это.\n` : ""}Ответь ТОЛЬКО JSON-объектом без пояснений:
{"items":[{"name": "название на русском", "grams": число, "kcal": число, "protein": число (г), "fat": число (г), "carbs": число (г)}],
 "kcal_low": число, "kcal_high": число (честный диапазон калорий всего приёма пищи с учётом того, чего не видно на фото: масло, соус, начинка, точный вес),
 "title": "короткое название всего приёма пищи на русском, до 60 символов",
 "has_veg_or_fruit": true или false,
 "confidence": "high" | "medium" | "low"}
Если на фото нет еды, верни {"items": [], "title": "не похоже на еду"}.` };
  }
  if (task === "cook") {
    const items = str(b.items, 600);
    if (!items) return { error: "empty" };
    const kcal = num(b.kcal, 150, 1500) ?? 600;
    const protein = b.protein == null ? null : num(b.protein, 0, 300);
    const light = b.light === true;
    return { prompt: `Ты повар и нутрициолог. Предложи 2 блюда на русском языке, которые можно приготовить из этих продуктов:
"""${items}"""
Можно дополнительно использовать только базовое: соль, перец, специи, растительное масло, вода. Если для блюда очень нужен ещё один продукт — укажи его в "extra", но лучше обходись имеющимся.
Цель по калорийности порции: около ${kcal} ккал${protein ? `, желательно побольше белка (осталось добрать ${protein} г)` : ""}${light ? ". Нужен лёгкий вариант" : ""}. Не предлагай пропускать еду.
Ответь ТОЛЬКО JSON-объектом без пояснений:
{"options":[{"title":"название блюда","why":"одно предложение, чем подходит","time_min":число,
 "ingredients":[{"name":"продукт","grams":число}],"steps":["шаг 1","шаг 2"],
 "portion_g":число (вес готовой порции),"kcal":число,"protein":число,"fat":число,"carbs":число,
 "has_veg_or_fruit":true или false,"extra":"продукт, которого не хватает, или пустая строка"}]}
Если из перечисленного нельзя приготовить еду, верни {"options":[]}.` };
  }
  return { error: "unknown_task" };
}

// Достаём JSON из ответа модели (модели иногда оборачивают его в ```json … ```)
export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(t); } catch { /* ищем первый объект */ }
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
  throw new Error("no json");
}

// ---------- Провайдер: Yandex AI Studio ----------
async function callModel(prompt: string, image?: string): Promise<string> {
  const key = env("YANDEX_API_KEY"), folder = env("YANDEX_FOLDER_ID");
  if (!key || !folder) throw Object.assign(new Error("ai not configured"), { code: "not_configured" });
  const model = `gpt://${folder}/${image ? VISION_MODEL : TEXT_MODEL}`;
  const content = image ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] : prompt;
  const res = await fetch("https://ai.api.cloud.yandex.net/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Api-Key ${key}`, "OpenAI-Project": folder, "x-folder-id": folder, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content }], temperature: 0.2, max_tokens: 1500 }),
    signal: AbortSignal.timeout(55_000),
  });
  const raw = await res.text();
  if (!res.ok) throw Object.assign(new Error(`provider ${res.status}: ${raw.slice(0, 300)}`), { code: "provider_error" });
  const text = JSON.parse(raw)?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw Object.assign(new Error("empty answer"), { code: "provider_error" });
  return text;
}

// ---------- Штрихкод: ищем товар в открытой базе Open Food Facts ----------
// Запрос идёт через наш сервер: так мы можем представиться, как просит Open Food Facts,
// и сайт не зависит от их настроек CORS. Данные не сохраняем — только передаём пользователю.
export function parseOff(json: any) {
  const p = json?.product;
  if (json?.status !== 1 || !p) return null;
  const n = p.nutriments ?? {};
  let kcal = Number(n["energy-kcal_100g"]);
  if (!Number.isFinite(kcal) && Number.isFinite(Number(n["energy_100g"]))) kcal = Number(n["energy_100g"]) / 4.184; // кДж → ккал
  const r1 = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x <= 100 ? Math.round(x * 10) / 10 : null; };
  const name = String(p.product_name_ru || p.product_name || "").trim().slice(0, 100);
  const brand = String(p.brands || "").split(",")[0].trim().slice(0, 40);
  return {
    name: brand && name && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name || brand,
    kcal100: Number.isFinite(kcal) && kcal >= 0 && kcal <= 950 ? Math.round(kcal) : null,
    p100: r1(n.proteins_100g), f100: r1(n.fat_100g), c100: r1(n.carbohydrates_100g),
    quantity: String(p.quantity || "").slice(0, 30),
  };
}
async function lookupBarcode(code: string) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_ru,brands,quantity,nutriments`;
  const res = await fetch(url, { headers: { "User-Agent": "Porciya/1.0 (stroev.danill@yandex.ru)" }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw Object.assign(new Error(`off ${res.status}`), { code: "provider_error" });
  return parseOff(await res.json());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "method_not_allowed" });

  // 1. Кто спрашивает: проверяем токен вошедшего пользователя
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(req, 401, { error: "not_signed_in" });
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: u, error: authErr } = await db.auth.getUser(token);
  const user = u?.user;
  if (authErr || !user) return reply(req, 401, { error: "not_signed_in" });

  // 2. Что спрашивает
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(req, 400, { error: "bad_json" }); }
  // Штрихкод — не ИИ, в дневной лимит ИИ не входит
  if (body.task === "barcode") {
    const code = String(body.code ?? "").replace(/\D/g, "");
    if (!/^\d{8,14}$/.test(code)) return reply(req, 400, { error: "bad_code" });
    try {
      const item = await lookupBarcode(code);
      if (!item || (!item.name && item.kcal100 == null)) return reply(req, 404, { error: "not_found" });
      return reply(req, 200, { result: item });
    } catch (e) { console.error(String(e)); return reply(req, 502, { error: "provider_error" }); }
  }

  const built = buildTask(String(body.task ?? ""), body);
  if ("error" in built) return reply(req, 400, { error: built.error });

  // 3. Дневной лимит (счётчик в базе, атомарно)
  const { data: used, error: limErr } = await db.rpc("ai_take", { p_user: user.id, p_limit: DAILY_LIMIT });
  if (limErr) return reply(req, 500, { error: "limit_check_failed" });
  if (used === -1) return reply(req, 429, { error: "daily_limit", limit: DAILY_LIMIT });

  // 4. Запрос к нейросети
  try {
    const text = await callModel(built.prompt, built.image);
    let result: unknown;
    try { result = extractJson(text); } catch { return reply(req, 502, { error: "bad_answer" }); }
    return reply(req, 200, { result, used, limit: DAILY_LIMIT });
  } catch (e) {
    console.error(String(e));
    const code = (e as { code?: string }).code ?? "provider_error";
    return reply(req, code === "not_configured" ? 500 : 502, { error: code });
  }
});
