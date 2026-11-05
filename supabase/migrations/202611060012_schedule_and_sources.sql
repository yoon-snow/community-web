-- Existing event IDs, attendance, payments and imported external IDs stay intact.
create table public.schedule_kinds (
 key text primary key check(key ~ '^[a-z][a-z0-9_]{0,63}$'),
 label text not null check(length(trim(label)) between 1 and 50),
 color text not null check(color ~ '^#[0-9A-Fa-f]{6}$'),
 sort_order integer not null default 100
);
insert into public.schedule_kinds(key,label,color,sort_order) values
 ('game','게임데이','#24477C',1),('lesson','레슨데이','#B4881C',2),
 ('match','교류전','#007A78',3),('tournament','대회','#90529B',4),
 ('social','회식','#B95631',5),('other','기타','#576779',6),
 ('practice','일반 운동','#52834B',7),('event','이벤트','#965680',8),('holiday','휴무','#737373',9);
alter table public.schedule_kinds enable row level security;
grant select on public.schedule_kinds to anon,authenticated;
grant insert,update on public.schedule_kinds to authenticated;
create policy kinds_read on public.schedule_kinds for select using(true);
create policy kinds_admin on public.schedule_kinds for all to authenticated using(private.is_admin()) with check(private.is_admin());
alter table public.events drop constraint events_kind_check,
 add constraint events_kind_catalog foreign key(kind) references public.schedule_kinds(key),
 add column regular_date date unique;
alter table public.events alter column guests_open set default true;

-- A date remains reserved when its generated event is moved, cancelled or hidden.
create function public.extend_regular_schedule() returns integer
language plpgsql security invoker set search_path='' as $$
declare first_day date := (now() at time zone 'Asia/Seoul')::date; added integer;
begin
 if current_user <> 'service_role' then
   if not private.is_admin() then raise exception 'admin required' using errcode='42501'; end if;
 end if;
 with days as (select first_day+n as day from generate_series(0,55) n),
 slots as (select day,extract(isodow from day) as dow from days where extract(isodow from day) in (1,2,4,5,7)),
 planned as (select day,case when dow in (1,5) then 'lesson' else 'game' end as kind,
 ((day+case when dow=7 then time '17:00' else time '18:00' end) at time zone 'Asia/Seoul') as starts from slots)
 insert into public.events(regular_date,title,starts_at,ends_at,location,kind,guests_open,guest_fee)
 select day,k.label,p.starts,p.starts+interval '3 hours','광명동초등학교',p.kind,true,
 case when p.kind='lesson' then 15000 else 5000 end from planned p join public.schedule_kinds k on k.key=p.kind
 where p.starts>now() and not exists (select 1 from public.events e where (e.starts_at at time zone 'Asia/Seoul')::date=p.day and e.kind=p.kind)
 on conflict(regular_date) do nothing;
 get diagnostics added=row_count;
 return added;
end $$;
revoke all on function public.extend_regular_schedule() from public,anon;
grant execute on function public.extend_regular_schedule() to authenticated,service_role;
grant select on public.schedule_kinds to service_role;

create table public.club_sources (
 id uuid primary key default gen_random_uuid(), category text not null check(category in ('form','guide','instagram','sheet')),
 title text not null check(length(title) between 1 and 150), content text not null default '' check(length(content)<=20000),
 url text not null default '' check(url='' or url like 'https://%'),
 created_at timestamptz not null default now(), unique(category,title)
);
alter table public.club_sources enable row level security;
grant select,insert,update on public.club_sources to authenticated;
revoke all on public.club_sources from anon;
create policy sources_admin on public.club_sources for all to authenticated using(private.is_admin()) with check(private.is_admin());
