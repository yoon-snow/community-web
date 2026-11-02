-- Optional owner-run setup after enabling pg_cron and pg_net in Supabase.
-- In Vault, create spotlight_app_url (trusted HTTPS app origin) and spotlight_cron_secret
-- (same value as Vercel CRON_SECRET). Never put the actual secret in this file/Git.
-- Existing Vercel daily fallback is safe: per-event/per-admin dedupe prevents duplicate notices.
do $$
begin
 if not exists(select 1 from pg_extension where extname='pg_cron') or not exists(select 1 from pg_extension where extname='pg_net') then
  raise exception 'Enable pg_cron and pg_net before installing the roster schedule';
 end if;
 if not exists(select 1 from vault.decrypted_secrets where name='spotlight_app_url' and decrypted_secret ~ '^https://[^/]+/?$')
 or not exists(select 1 from vault.decrypted_secrets where name='spotlight_cron_secret' and length(decrypted_secret)>=32) then
  raise exception 'Configure the app origin and cron secret in Vault first';
 end if;
end; $$;
-- pg_cron uses UTC here: 04:00 UTC = 13:00 Asia/Seoul (no daylight-saving offset).
select cron.schedule('spotlight-roster-1300-kst','0 4 * * *', $job$
 select net.http_get(
  url := rtrim((select decrypted_secret from vault.decrypted_secrets where name='spotlight_app_url'),'/')||'/api/club/cron',
  headers := jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='spotlight_cron_secret')),
  timeout_milliseconds := 10000
 );
$job$);
-- Inspect cron.job_run_details and net._http_response after a staging test.
-- Remove only this job if needed: select cron.unschedule('spotlight-roster-1300-kst');
