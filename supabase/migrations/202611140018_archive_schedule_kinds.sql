begin;
alter table public.schedule_kinds add column archived boolean not null default false;

create function private.check_event_kind_active() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and old.kind=new.kind then return new; end if;
  if (select archived from public.schedule_kinds where key=new.kind for share) then
    if tg_op='INSERT' and new.regular_date is not null then return null; end if;
    raise exception 'Archived event kind' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger check_event_kind_active before insert or update of kind on public.events
for each row execute function private.check_event_kind_active();
commit;
