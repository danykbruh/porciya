-- =====================================================================
-- Порция — схема базы данных для Supabase
-- Запускать один раз: Supabase → SQL Editor → New query → вставить → Run
--
-- Принцип безопасности: deny by default.
--  * RLS включён на всех таблицах.
--  * Каждый пользователь видит и меняет только строки со своим user_id.
--  * Анонимным (не вошедшим) пользователям доступ к таблицам не выдаётся.
-- =====================================================================

-- ---------- Общая функция: обновлять updated_at при изменении ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Профиль: программа питания, настройки, согласие ----------
create table if not exists public.profiles (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  plan              jsonb,                 -- программа питания (цель, рост, вес, активность…)
  settings          jsonb not null default '{}'::jsonb,  -- напоминания, тема, приветствие
  health_consent_at timestamptz,           -- когда дано согласие на обработку данных о здоровье
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------- Приёмы пищи ----------
create table if not exists public.meals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date          date not null,
  time          time not null,
  type          text not null check (type in ('breakfast','lunch','dinner','snack')),
  name          text not null check (char_length(name) between 1 and 120),
  grams         integer check (grams between 1 and 5000),
  kcal          integer check (kcal between 0 and 10000),
  kcal_min      integer check (kcal_min >= 0),
  kcal_max      integer check (kcal_max >= 0),
  confidence    text check (confidence in ('high','medium','low')),
  kcal_source   text check (kcal_source in ('ai','photo','recipe','fav','manual')),
  kcal_per100   numeric(6,1) check (kcal_per100 between 0 and 950),
  p100          numeric(5,1) check (p100 between 0 and 100),
  f100          numeric(5,1) check (f100 between 0 and 100),
  c100          numeric(5,1) check (c100 between 0 and 100),
  protein       numeric(6,1) check (protein >= 0),
  fat           numeric(6,1) check (fat >= 0),
  carbs         numeric(6,1) check (carbs >= 0),
  veg           boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists meals_user_date_idx on public.meals (user_id, date);

-- ---------- Взвешивания (одна запись на день) ----------
create table if not exists public.weights (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  kg         numeric(5,1) not null check (kg between 30 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ---------- Избранные блюда ----------
create table if not exists public.favorites (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  type         text check (type in ('breakfast','lunch','dinner','snack')),
  grams        integer check (grams between 1 and 5000),
  kcal         integer check (kcal between 0 and 10000),
  kcal_per100  numeric(6,1),
  p100         numeric(5,1),
  f100         numeric(5,1),
  c100         numeric(5,1),
  veg          boolean not null default false,
  kcal_source  text,
  created_at   timestamptz not null default now()
);
create unique index if not exists favorites_user_name_uniq on public.favorites (user_id, lower(name));

-- ---------- Счётчик ИИ-запросов (пишет только сервер) ----------
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

-- ---------- Триггеры updated_at ----------
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
drop trigger if exists meals_updated_at on public.meals;
create trigger meals_updated_at before update on public.meals
  for each row execute function public.set_updated_at();
drop trigger if exists weights_updated_at on public.weights;
create trigger weights_updated_at before update on public.weights
  for each row execute function public.set_updated_at();

-- ---------- Профиль создаётся автоматически при регистрации ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Row Level Security
-- (select auth.uid()) в скобках — рекомендация Supabase для скорости:
-- значение вычисляется один раз на запрос, а не для каждой строки.
-- =====================================================================
alter table public.profiles  enable row level security;
alter table public.meals     enable row level security;
alter table public.weights   enable row level security;
alter table public.favorites enable row level security;
alter table public.ai_usage  enable row level security;

-- profiles: читать и менять только свой; создаёт триггер, удаляется вместе с аккаунтом
drop policy if exists "own profile: select" on public.profiles;
create policy "own profile: select" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own profile: update" on public.profiles;
create policy "own profile: update" on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- meals / weights / favorites: полный доступ только к своим строкам
do $$
declare t text;
begin
  foreach t in array array['meals','weights','favorites'] loop
    execute format('drop policy if exists "own rows: select" on public.%I', t);
    execute format('create policy "own rows: select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "own rows: insert" on public.%I', t);
    execute format('create policy "own rows: insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "own rows: update" on public.%I', t);
    execute format('create policy "own rows: update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists "own rows: delete" on public.%I', t);
    execute format('create policy "own rows: delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ai_usage: пользователь может только посмотреть свой счётчик; менять — только сервер
drop policy if exists "own usage: select" on public.ai_usage;
create policy "own usage: select" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

-- =====================================================================
-- Права на таблицы (автоматическая выдача прав при создании проекта отключена)
-- Только вошедшим пользователям; анонимам — ничего.
-- =====================================================================
revoke all on public.profiles, public.meals, public.weights, public.favorites, public.ai_usage from anon;
grant select, update                 on public.profiles  to authenticated;
grant select, insert, update, delete on public.meals     to authenticated;
grant select, insert, update, delete on public.weights   to authenticated;
grant select, insert, update, delete on public.favorites to authenticated;
grant select                         on public.ai_usage  to authenticated;

-- =====================================================================
-- Удаление аккаунта самим пользователем («Удалить все мои данные»).
-- Удаляет пользователя из auth.users — все его строки удалятся каскадом.
-- =====================================================================
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- Проверка: все таблицы должны показать rls_enabled = true ----------
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
order by tablename;
