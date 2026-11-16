-- Keep the existing intake transaction and its grants. Lock and check the event
-- before accepting applications through either guest submission RPC.
do $migration$
declare
  definition text := pg_get_functiondef('public.submit_guest(jsonb,text)'::regprocedure);
  previous text := 'and starts_at>now() and kind<>''holiday'';';
  revised text := $check$and kind<>'holiday' for share;
 if e.id is not null and e.starts_at <= clock_timestamp() + interval '1 hour' then
   raise exception 'guest application deadline passed';
 end if;$check$;
begin
  if strpos(definition, revised) > 0 then return; end if;
  if strpos(definition, previous) = 0 then raise exception 'Unexpected guest submission function'; end if;
  execute replace(definition, previous, revised);
end;
$migration$;
