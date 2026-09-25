// Порция — service worker: позволяет установить приложение и открывать его без интернета.
// Меняйте VERSION при каждом обновлении файлов, чтобы телефоны получили свежую версию.
const VERSION = "porciya-v5";
const SHELL = [
  "./", "index.html", "css/styles.css",
  "js/config.js", "js/app.js", "js/cloud.js",
  "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-32.png", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
];
const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    try { await c.add(LIB); } catch (err) { /* библиотека докачается при первом открытии */ }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Запросы к базе и входу никогда не кэшируем: там личные данные и свежие токены
  if (url.hostname.endsWith("supabase.co")) return;
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && req.url !== LIB) return;

  if (sameOrigin) {
    // Свои файлы: сначала сеть (чтобы сразу видеть обновления), без сети — из кэша
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
        return res;
      } catch (err) {
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match("index.html"));
      }
    })());
  } else {
    // Библиотека Supabase: сначала кэш
    e.respondWith((async () => (await caches.match(req)) || fetch(req).then(async (res) => {
      if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
      return res;
    }))());
  }
});

// ---------- Пуш-уведомления ----------
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Порция", {
    body: d.body || "",
    tag: d.tag,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) if ("focus" in w) return w.focus();
    return self.clients.openWindow(new URL(e.notification.data?.url || "./", self.registration.scope).href);
  })());
});
