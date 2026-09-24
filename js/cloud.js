// Порция — облако: регистрация, вход и хранение данных в Supabase.
// Подключается после app.js и подменяет хранилище приложения на базу Supabase.
// Безопасность обеспечивают правила RLS в базе (supabase/01_schema.sql):
// даже если кто-то изменит этот код в браузере, чужие данные ему не отдадут.
(function () {
  "use strict";
  const cfg = window.PORCIYA_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  // ---------- Экран входа ----------
  let mode = "loading"; // loading | login | signup | reset | newpass | consent
  const T_ = {
    loading: { title: "Порция", lead: "Подключаюсь…", btn: "" },
    login: { title: "Вход", lead: "Войдите, чтобы дневник был доступен на всех ваших устройствах.", btn: "Войти" },
    signup: { title: "Регистрация", lead: "Создайте аккаунт — это бесплатно. Мы пришлём письмо для подтверждения почты.", btn: "Создать аккаунт" },
    reset: { title: "Восстановление пароля", lead: "Укажите почту — пришлём ссылку для нового пароля.", btn: "Отправить ссылку" },
    newpass: { title: "Новый пароль", lead: "Придумайте новый пароль — не короче 8 символов.", btn: "Сохранить пароль" },
    consent: { title: "Ещё один шаг", lead: "Порция хранит данные о вашем питании и весе. Это данные о здоровье, поэтому нужно ваше согласие.", btn: "Продолжить" },
  };

  function setMode(m) {
    mode = m;
    const t = T_[m];
    $("authTitle").textContent = t.title;
    $("authLead").textContent = t.lead;
    $("authForm").hidden = m === "loading";
    $("authModeSeg").hidden = !(m === "login" || m === "signup");
    $("afEmailWrap").hidden = !(m === "login" || m === "signup" || m === "reset");
    $("afPassWrap").hidden = !(m === "login" || m === "signup" || m === "newpass");
    $("afConsentWrap").hidden = !(m === "signup" || m === "consent");
    $("afForgot").hidden = m !== "login";
    $("afBack").hidden = !(m === "reset");
    $("afLogout").hidden = m !== "consent";
    $("afResend").hidden = true;
    $("afPass").autocomplete = m === "login" ? "current-password" : "new-password";
    $("afPassLabel").textContent = m === "newpass" ? "Новый пароль" : "Пароль";
    $("afSubmit").textContent = t.btn;
    if (m === "login") $("amLogin").checked = true;
    if (m === "signup") $("amSignup").checked = true;
    msg("", "");
  }
  function msg(err, ok) {
    $("afErr").textContent = err || ""; $("afErr").hidden = !err;
    $("afOk").textContent = ok || ""; $("afOk").hidden = !ok;
  }
  function showAuth(m, okText) {
    document.body.classList.add("signed-out");
    $("authView").hidden = false;
    setMode(m);
    if (okText) msg("", okText);
  }
  function hideAuth() {
    document.body.classList.remove("signed-out");
    $("authView").hidden = true;
  }

  // Понятные сообщения вместо технических
  function humanError(e) {
    const t = String(e?.message || e || "");
    if (/invalid login credentials/i.test(t)) return "Неверная почта или пароль.";
    if (/email not confirmed/i.test(t)) return "Почта ещё не подтверждена. Откройте письмо от Порции и нажмите ссылку.";
    if (/rate limit|too many/i.test(t) || e?.status === 429) return "Слишком много попыток. Подождите немного и попробуйте снова.";
    if (/password should be at least|weak password|password.*characters/i.test(t)) return "Пароль слишком простой: минимум 8 символов.";
    if (/unable to validate email|invalid email|email address .* invalid/i.test(t)) return "Проверьте адрес почты.";
    if (/failed to fetch|network/i.test(t)) return "Нет связи с сервером. Проверьте интернет.";
    return "Что-то пошло не так. Попробуйте ещё раз.";
  }

  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) {
    showAuth("loading");
    $("authLead").textContent = "Не удалось загрузить модуль входа. Проверьте интернет и обновите страницу.";
    return;
  }

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // ---------- Преобразование строк базы <-> объектов приложения ----------
  const MEAL_COLS = ["date", "time", "type", "name", "grams", "kcal", "kcal_min", "kcal_max", "confidence", "kcal_source",
    "kcal_per100", "p100", "f100", "c100", "protein", "fat", "carbs", "veg"];
  const FAV_COLS = ["name", "type", "grams", "kcal", "kcal_per100", "p100", "f100", "c100", "veg", "kcal_source"];
  const NUMERIC = new Set(["grams", "kcal", "kcal_min", "kcal_max", "kcal_per100", "p100", "f100", "c100", "protein", "fat", "carbs", "kg"]);
  const toCamel = { kcal_min: "kcalMin", kcal_max: "kcalMax", kcal_source: "kcalSource", kcal_per100: "kcalPer100" };

  function toRow(obj, cols) {
    const r = {};
    for (const c of cols) {
      let v = obj[toCamel[c] || c];
      if (v === undefined || v === "" || (typeof v === "number" && !isFinite(v))) v = null;
      r[c] = v;
    }
    if ("veg" in r) r.veg = !!obj.veg;
    return r;
  }
  function fromRow(row) {
    const o = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === null || k === "user_id" || k === "created_at" || k === "updated_at") continue;
      o[toCamel[k] || k] = NUMERIC.has(k) ? Number(v) : v;
    }
    if (o.time) o.time = String(o.time).slice(0, 5);
    if (o.veg === false) delete o.veg;
    return o;
  }
  const must = (p) => p.then((r) => { if (r.error) throw r.error; return r; });

  // ---------- Загрузка данных ----------
  let uid = null, loadingAll = null, lastLoad = 0;

  function applySettings(d) {
    settings = {
      reminders: { ...structuredClone(REM_DEFAULT), ...(d.reminders || {}), times: { ...REM_DEFAULT.times, ...(d.reminders?.times || {}) } },
      skipped: d.skipped || { date: "", types: [] },
      onboarded: !!d.onboarded,
    };
  }

  async function loadAll() {
    if (loadingAll) return loadingAll;
    loadingAll = (async () => {
      const [m, w, f, p] = await Promise.all([
        sb.from("meals").select("*").order("date", { ascending: false }).limit(2000),
        sb.from("weights").select("date,kg").order("date", { ascending: false }).limit(1000),
        sb.from("favorites").select("*").limit(300),
        sb.from("profiles").select("plan,settings,health_consent_at").maybeSingle(),
      ]);
      for (const r of [m, w, f, p]) if (r.error) throw r.error;
      meals = m.data.map(fromRow);
      weights = w.data.map((r) => ({ id: r.date, date: r.date, kg: Number(r.kg) }));
      favorites = f.data.map(fromRow);
      plan = p.data?.plan || null;
      applySettings(p.data?.settings || {});
      if (editingMeal && !meals.some((x) => x.id === editingMeal)) editingMeal = null;
      loaded.meals = loaded.settings = loaded.profile = true;
      lastLoad = Date.now();
      setStatus("Сохранено в облаке");
      return p.data;
    })();
    try { return await loadingAll; } finally { loadingAll = null; }
  }
  async function refresh() {
    try { await loadAll(); }
    catch (e) { setStatus("Нет связи с сервером"); throw e; }
    if (!(currentTab === "plan" && editingPlan)) renderAll();
    fillRemForm(); renderNudges();
  }

  // ---------- Хранилище для app.js (тот же интерфейс, что был в Claude) ----------
  function installStores() {
    mealsCol = {
      add: async (o) => { await must(sb.from("meals").insert(toRow(o, MEAL_COLS))); await refresh(); },
      doc: (id) => ({
        set: async (o) => { await must(sb.from("meals").update(toRow(o, MEAL_COLS)).eq("id", id)); await refresh(); },
        delete: async () => { await must(sb.from("meals").delete().eq("id", id)); await refresh(); },
      }),
    };
    weightsCol = {
      doc: (date) => ({
        set: async (o) => {
          await must(sb.from("weights").upsert({ user_id: uid, date: o.date, kg: o.kg }, { onConflict: "user_id,date" }));
          await refresh();
        },
        delete: async () => { await must(sb.from("weights").delete().eq("date", date)); await refresh(); },
      }),
    };
    favCol = {
      add: async (o) => {
        const r = await sb.from("favorites").insert(toRow(o, FAV_COLS));
        if (r.error && r.error.code !== "23505") throw r.error; // 23505 — такое блюдо уже в избранном
        await refresh();
      },
      doc: (id) => ({ delete: async () => { await must(sb.from("favorites").delete().eq("id", id)); await refresh(); } }),
    };
    profileRef = {
      set: async ({ plan: pl }) => { await must(sb.from("profiles").update({ plan: pl }).eq("user_id", uid)); await refresh(); },
    };
    settingsRef = {
      set: async (s) => { await must(sb.from("profiles").update({ settings: s }).eq("user_id", uid)); },
    };
  }
  function clearStores() {
    mealsCol = weightsCol = favCol = profileRef = settingsRef = null;
    meals = []; weights = []; favorites = []; plan = null; editingMeal = null;
    loaded = { meals: false, settings: false, profile: false };
  }

  // ---------- Сессия ----------
  let currentUser = null;
  async function onSession(session) {
    const user = session?.user || null;
    if (mode === "newpass") return; // пользователь задаёт новый пароль
    if (!user) {
      currentUser = null; uid = null; clearStores();
      $("who").hidden = true; $("logoutBtn").hidden = true;
      setStatus("");
      if (mode === "loading" || $("authView").hidden) showAuth("login");
      return;
    }
    if (currentUser?.id === user.id && $("authView").hidden) return; // уже вошли, данные загружены
    currentUser = user; uid = user.id;
    $("who").hidden = false; $("whoImg").hidden = true;
    $("whoName").textContent = user.email || "Ваш аккаунт";
    $("logoutBtn").hidden = false;
    installStores();
    let prof;
    try { prof = await loadAll(); }
    catch (e) { showAuth("login"); msg(humanError(e)); return; }
    // Согласие на обработку данных о здоровье
    if (!prof?.health_consent_at) {
      const given = user.user_metadata?.health_consent;
      if (given) {
        await sb.from("profiles").update({ health_consent_at: given }).eq("user_id", uid);
      } else {
        showAuth("consent");
        return;
      }
    }
    hideAuth();
    renderAll(); fillRemForm(); renderNudges(); maybeOnboard();
  }

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") { showAuth("newpass"); return; }
    // вызываем асинхронно, чтобы не блокировать внутренние процессы Supabase
    setTimeout(() => onSession(session), 0);
  });
  sb.auth.getSession().then(({ data }) => onSession(data.session));

  // Синхронизация, если данные поменялись на другом устройстве
  function syncSoon() { if (uid && Date.now() - lastLoad > 20000) refresh().catch(() => {}); }
  window.addEventListener("focus", syncSoon);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncSoon(); });

  // ---------- Обработчики формы ----------
  document.querySelectorAll('input[name="authmode"]').forEach((r) => r.addEventListener("change", () => setMode(r.value)));
  $("afForgot").onclick = () => setMode("reset");
  $("afBack").onclick = () => setMode("login");
  $("afLogout").onclick = () => sb.auth.signOut();
  $("logoutBtn").onclick = async () => { await sb.auth.signOut(); showAuth("login", "Вы вышли из аккаунта."); };
  $("afPolicy").onclick = () => {
    const box = $("afPolicyBox");
    if (!box.childElementCount) box.append($("privacy").querySelector(".policy").cloneNode(true));
    box.hidden = !box.hidden;
  };
  $("afResend").onclick = async () => {
    const email = $("afEmail").value.trim();
    try { await must(sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: location.origin + location.pathname } })); msg("", "Письмо отправлено ещё раз."); }
    catch (e) { msg(humanError(e)); }
  };

  $("authForm").addEventListener("submit", async (ev) => {
    ev.preventDefault(); msg("", "");
    const email = $("afEmail").value.trim(), pass = $("afPass").value;
    const redirect = location.origin + location.pathname;
    if ((mode === "login" || mode === "signup" || mode === "reset") && !/^\S+@\S+\.\S+$/.test(email)) return msg("Проверьте адрес почты.");
    if ((mode === "signup" || mode === "newpass") && pass.length < 8) return msg("Пароль — минимум 8 символов.");
    if (mode === "login" && !pass) return msg("Введите пароль.");
    if ((mode === "signup" || mode === "consent") && !$("afConsent").checked) return msg("Без согласия на обработку данных приложение работать не сможет.");
    const btn = $("afSubmit"); btn.disabled = true;
    try {
      if (mode === "login") {
        const r = await sb.auth.signInWithPassword({ email, password: pass });
        if (r.error) { if (/not confirmed/i.test(r.error.message)) $("afResend").hidden = false; throw r.error; }
      } else if (mode === "signup") {
        await must(sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: redirect, data: { health_consent: new Date().toISOString() } } }));
        $("afPass").value = "";
        setMode("login"); $("afEmail").value = email;
        msg("", `Мы отправили письмо на ${email}. Откройте его и нажмите ссылку, чтобы подтвердить почту, — после этого войдите.`);
        $("afResend").hidden = false;
      } else if (mode === "reset") {
        await must(sb.auth.resetPasswordForEmail(email, { redirectTo: redirect }));
        msg("", "Если такой аккаунт есть, мы отправили на эту почту ссылку для нового пароля.");
      } else if (mode === "newpass") {
        await must(sb.auth.updateUser({ password: pass }));
        $("afPass").value = "";
        mode = "login";
        const { data } = await sb.auth.getSession();
        await onSession(data.session);
      } else if (mode === "consent") {
        await must(sb.from("profiles").update({ health_consent_at: new Date().toISOString() }).eq("user_id", uid));
        hideAuth(); renderAll(); fillRemForm(); renderNudges(); maybeOnboard();
      }
    } catch (e) { msg(humanError(e)); }
    finally { btn.disabled = false; }
  });

  // ---------- Для app.js: удаление аккаунта ----------
  window.porciyaCloud = {
    async deleteAccount() {
      await must(sb.rpc("delete_my_account"));
      try { await sb.auth.signOut(); } catch (e) { /* пользователя уже нет — это нормально */ }
      showAuth("login", "Аккаунт и все данные удалены.");
    },
  };
})();
