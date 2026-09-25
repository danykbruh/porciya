-- =====================================================================
-- Порция — дневной лимит ИИ-запросов
-- Запускать один раз: Supabase → SQL Editor → New query → вставить → Run
-- Счётчик хранится в таблице ai_usage (создана в 01_schema.sql).
-- Функцию вызывает только сервер (Edge Function «ai»), пользователи — не могут.
-- =====================================================================
create or replace function public.ai_take(p_user uuid, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  -- +1 к счётчику за сегодня, но только если лимит ещё не исчерпан.
  -- Всё одной командой, поэтому два одновременных запроса не проскочат лимит.
  insert into public.ai_usage (user_id, day, count)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set count = public.ai_usage.count + 1
    where public.ai_usage.count < p_limit
  returning count into n;
  return coalesce(n, -1);   -- -1 = лимит на сегодня исчерпан
end;
$$;

revoke all on function public.ai_take(uuid, integer) from public, anon, authenticated;
grant execute on function public.ai_take(uuid, integer) to service_role;

-- Проверка: функция должна появиться в списке
select proname from pg_proc where proname = 'ai_take';
