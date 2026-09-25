-- =====================================================================
-- Порция — расписание: каждые 10 минут вызывать функцию send-reminders
-- ПЕРЕД ЗАПУСКОМ замените ВСТАВЬТЕ_СЮДА_CRON_SECRET на свой секрет
-- (тот же, что в секретах Edge Functions под именем CRON_SECRET).
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Секрет хранится в зашифрованном хранилище Vault, а не открытым текстом в задании
select vault.create_secret('ВСТАВЬТЕ_СЮДА_CRON_SECRET', 'porciya_cron_secret');

-- Если задание уже было — удалить старое
select cron.unschedule(jobid) from cron.job where jobname = 'porciya-reminders';

select cron.schedule(
  'porciya-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://hjhkclhidtmgkehaeueq.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'porciya_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Проверка: задание должно появиться в списке
select jobid, jobname, schedule from cron.job where jobname = 'porciya-reminders';
