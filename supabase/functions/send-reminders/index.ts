// Порция — серверная функция напоминаний (Supabase Edge Function, Deno).
// Каждые 10 минут её вызывает расписание (supabase/03_cron.sql).
// Для каждого пользователя с включёнными напоминаниями проверяет:
// наступило ли время завтрака/обеда/ужина, записан ли этот приём пищи,
// не отмечен ли он как пропущенный и не отправляли ли мы уже напоминание сегодня.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const MAIN = ["breakfast", "lunch", "dinner"] as const;
// Заголовок — сразу понятно, о каком приёме пищи речь (на iPhone он показывается над текстом)
const TITLE: Record<string, string> = {
  breakfast: "🍳 Завтрак",
  lunch: "🍲 Обед",
  dinner: "🍽 Ужин",
};
const TEXT: Record<string, string> = {
  breakfast: "Пора позавтракать? Не забудьте записать, что съели.",
  lunch: "Время обеда — запишите, что съели.",
  dinner: "Время ужина — запишите, что съели.",
};
const DEFAULT_TIMES: Record<string, string> = { breakfast: "10:00", lunch: "14:00", dinner: "20:00" };
const WINDOW_MIN = 180; // напоминаем в течение 3 часов после назначенного времени, не позже

function localNow(tz: string, now: Date) {
  let p: Record<string, string> = {};
  try {
    p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((x) => [x.type, x.value]));
  } catch { return localNow("UTC", now); }
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

export function dueTypes(settings: any, tz: string, now: Date, logged: string[], sent: string[]) {
  const r = settings?.reminders;
  if (!r?.on) return { day: "", types: [] as string[] };
  const { day, minutes } = localNow(tz, now);
  const skipped: string[] = settings?.skipped?.date === day ? (settings.skipped.types || []) : [];
  const types = MAIN.filter((t) => {
    const at = r.times?.[t] || DEFAULT_TIMES[t];
    if (!/^\d{2}:\d{2}$/.test(at)) return false;
    const diff = minutes - toMin(at);
    return diff >= 0 && diff < WINDOW_MIN && !logged.includes(t) && !skipped.includes(t) && !sent.includes(t);
  });
  return { day, types };
}

Deno.serve(async (req) => {
  // Пускаем только наше расписание
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("forbidden", { status: 403 });

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: subs, error: e1 } = await db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth,tz");
  if (e1) return new Response(e1.message, { status: 500 });
  const byUser = new Map<string, typeof subs>();
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  if (!byUser.size) return Response.json({ users: 0, sent: 0 });

  const { data: profiles, error: e2 } = await db.from("profiles").select("user_id,settings").in("user_id", [...byUser.keys()]);
  if (e2) return new Response(e2.message, { status: 500 });

  const now = new Date();
  let sent = 0;
  for (const p of profiles ?? []) {
    const userSubs = byUser.get(p.user_id)!;
    const tz = userSubs[0].tz || "UTC";
    const pre = dueTypes(p.settings, tz, now, [], []);
    if (!pre.types.length) continue;

    const [{ data: meals }, { data: log }] = await Promise.all([
      db.from("meals").select("type").eq("user_id", p.user_id).eq("date", pre.day),
      db.from("push_log").select("type").eq("user_id", p.user_id).eq("day", pre.day),
    ]);
    const { day, types } = dueTypes(p.settings, tz, now, (meals ?? []).map((m) => m.type), (log ?? []).map((l) => l.type));

    for (const type of types) {
      // Сначала отмечаем в журнале: если запись уже есть — значит, другой запуск успел отправить
      const { error: logErr } = await db.from("push_log").insert({ user_id: p.user_id, day, type });
      if (logErr) continue;
      const payload = JSON.stringify({ title: TITLE[type], body: TEXT[type], tag: `meal-${type}-${day}`, url: "./" });
      for (const s of userSubs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
          sent++;
        } catch (err: any) {
          // 404/410 — устройство отписалось или удалило приложение: удаляем подписку
          if (err?.statusCode === 404 || err?.statusCode === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
          else console.error("push failed", err?.statusCode, err?.body);
        }
      }
    }
  }
  return Response.json({ users: byUser.size, sent });
});
