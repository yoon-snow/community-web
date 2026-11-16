alter table public.announcements add column if not exists pinned boolean not null default false;

create or replace function public.member_event_votes(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.events where id=p_event and status <> 'deleted') then
    raise exception 'unknown event';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'response', coalesce(a.response, 'unanswered')) order by m.name, m.id), '[]'::jsonb)
    from public.members m left join public.event_attendance a on a.member_id=m.id and a.event_id=p_event
    where m.status='active'
  );
end $$;
revoke all on function public.member_event_votes(uuid) from public, anon;
grant execute on function public.member_event_votes(uuid) to authenticated;
