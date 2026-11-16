begin;

create or replace function private.hold_regular_sunday_intake()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.guests_open := false;
  return new;
end;
$$;

create trigger hold_regular_sunday_intake before insert on public.events
for each row when (new.regular_date is not null and extract(isodow from new.regular_date) = 7)
execute function private.hold_regular_sunday_intake();

update public.events e set guests_open = false
where regular_date is not null and status = 'scheduled' and starts_at > now()
  and extract(isodow from starts_at at time zone 'Asia/Seoul') = 7 and guests_open
  and not exists (select 1 from public.guest_applications a where a.event_id = e.id);

commit;
