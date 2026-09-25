-- =====================================================================
-- Порция — пуш-уведомления: подписки устройств и журнал отправок
-- Запускать один раз: Supabase → SQL Editor → New query → вставить → Run
-- =====================================================================

-- Подписка одного устройства на уведомления (адрес push-сервиса браузера + ключи шифрования)
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique check (endpoint like 'https://%' and char_length(endpoint) < 1000),
  p256dh     text not null check (char_length(p256dh) < 200),
  auth       text not null check (char_length(auth) < 100),
  tz         text not null default 'UTC' check (char_length(tz) < 64),   -- часовой пояс устройства
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Что уже отправлено сегодня — чтобы не присылать одно напоминание дважды. Пишет только сервер.
create table if not exists public.push_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  type    text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, day, type)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_log           enable row level security;   -- политик нет: пользователям недоступна

drop policy if exists "own subs: select" on public.push_subscriptions;
create policy "own subs: select" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own subs: insert" on public.push_subscriptions;
create policy "own subs: insert" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "own subs: update" on public.push_subscriptions;
create policy "own subs: update" on public.push_subscriptions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own subs: delete" on public.push_subscriptions;
create policy "own subs: delete" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions, public.push_log from anon;
revoke all on public.push_log from authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Серверной функции (роль service_role) нужен доступ на чтение профилей и еды и на запись журнала
grant select on public.profiles, public.meals to service_role;
grant select, delete on public.push_subscriptions to service_role;
grant select, insert on public.push_log to service_role;

-- Проверка
select tablename, rowsecurity as rls_enabled from pg_tables
where schemaname = 'public' and tablename in ('push_subscriptions','push_log');
