-- Additive operations upgrade. Keep existing IDs, RLS and operational rows.
alter table public.event_attendance add column checked_at timestamptz;

create or replace function public.respond_event(p_event uuid,p_response text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_member() then raise exception 'forbidden'; end if;
 if p_response is null or p_response not in ('yes','no','unanswered') then raise exception 'invalid response'; end if;
 perform 1 from public.events where id=p_event and starts_at>now() and status='scheduled' and kind<>'holiday' for share;
 if not found then raise exception 'event unavailable'; end if;
 insert into public.event_attendance(event_id,member_id,response) values(p_event,private.my_member_id(),p_response)
 on conflict(event_id,member_id) do update set response=excluded.response,updated_at=now();
end; $$;
create or replace function public.check_attendance(p_event uuid,p_member uuid,p_actual boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if p_actual is null then raise exception 'invalid attendance'; end if;
 perform 1 from public.events where id=p_event and ends_at<=now() and status in ('scheduled','completed') and kind<>'holiday' for share;
 if not found then raise exception 'event has not ended'; end if;
 insert into public.event_attendance(event_id,member_id,actual,checked_by,checked_at) values(p_event,p_member,p_actual,auth.uid(),now())
 on conflict(event_id,member_id) do update set actual=excluded.actual,checked_by=auth.uid(),checked_at=now(),updated_at=now();
end; $$;

create function private.member_attendance_summary(p_member uuid,p_year integer) returns jsonb language sql stable security definer set search_path='' as $$
 with actual as (
  select e.starts_at,(e.starts_at at time zone 'Asia/Seoul')::date as day
  from public.event_attendance a join public.events e on e.id=a.event_id
  where a.member_id=p_member and a.actual=true and e.ends_at<=now() and e.status in ('scheduled','completed') and e.kind<>'holiday'
 ), months as (
  select n as month,(select count(*) from actual where extract(year from day)=p_year and extract(month from day)=n) as count from generate_series(1,12) n
 ) select jsonb_build_object('year',p_year,'year_attendance',(select count(*) from actual where extract(year from day)=p_year),
  'total_attendance',(select count(*) from actual),'last_attended_at',(select max(starts_at) from actual),
  'months',(select jsonb_agg(to_jsonb(months) order by month) from months));
$$;
create or replace function public.my_activity_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; today date:=(now() at time zone 'Asia/Seoul')::date; m uuid;
begin
 if not private.is_member() then raise exception 'forbidden'; end if;
 m:=private.my_member_id();
 result:=private.member_attendance_summary(m,extract(year from today)::integer);
 return result||jsonb_build_object('month_attendance',(result->'months'->(extract(month from today)::integer-1)->'count'),
  'current_month_payment',(select jsonb_build_object('status',p.status,'amount',p.amount,'month',p.month) from public.membership_payments p where p.member_id=m and p.month=date_trunc('month',today)::date));
end; $$;

create function private.member_attendance_report(p_member uuid,p_year integer,p_page integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; rows jsonb; total bigint;
begin
 if p_year is null or p_year not between 1900 and 2200 or p_page is null or p_page not between 0 and 10000 then raise exception 'invalid report range'; end if;
 result:=private.member_attendance_summary(p_member,p_year);
 select count(*) into total from public.event_attendance a join public.events e on e.id=a.event_id
 where a.member_id=p_member and extract(year from e.starts_at at time zone 'Asia/Seoul')=p_year
 and e.ends_at<=now() and e.status in ('scheduled','completed') and e.kind<>'holiday';
 select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at desc,x.id),'[]') into rows from (
  select a.id,a.member_id,a.event_id,a.response,a.actual,a.checked_at,e.starts_at,
   jsonb_build_object('id',e.id,'title',e.title,'starts_at',e.starts_at,'ends_at',e.ends_at,'kind',e.kind,'status',e.status) as events
  from public.event_attendance a join public.events e on e.id=a.event_id
  where a.member_id=p_member and extract(year from e.starts_at at time zone 'Asia/Seoul')=p_year
  and e.ends_at<=now() and e.status in ('scheduled','completed') and e.kind<>'holiday'
  order by e.starts_at desc,a.id limit 30 offset p_page*30
 ) x;
 return jsonb_build_object('summary',result,'rows',rows,'total',total);
end; $$;
create function public.my_attendance_report(p_year integer,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_member() then raise exception 'forbidden'; end if;
 return private.member_attendance_report(private.my_member_id(),p_year,p_page);
end; $$;
create function public.admin_attendance_report(p_member uuid,p_year integer,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 return private.member_attendance_report(p_member,p_year,p_page);
end; $$;
create function public.admin_member_summary(p_member uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 result:=private.member_attendance_summary(p_member,extract(year from today)::integer);
 return jsonb_build_object('attendance_count',result->'total_attendance','year_attendance',result->'year_attendance',
  'month_attendance',result->'months'->(extract(month from today)::integer-1)->'count','last_attended',result->'last_attended_at',
  'current_month_payment',(select jsonb_build_object('status',p.status,'amount',p.amount,'month',p.month) from public.membership_payments p where p.member_id=p_member and p.month=date_trunc('month',today)::date));
end; $$;
create function public.admin_event_attendance(p_event uuid,p_response text default 'all',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.events; rows jsonb; summary jsonb; total bigint;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if p_response is null or p_response not in ('all','yes','no','unanswered') or p_page is null or p_page not between 0 and 10000 then raise exception 'invalid report range'; end if;
 select * into e from public.events where id=p_event and status<>'deleted';
 if e.id is null then raise exception 'event unavailable'; end if;
 select jsonb_build_object('members',count(*),'present',count(*) filter(where a.actual=true),'absent',count(*) filter(where a.actual=false),
  'unchecked',count(*) filter(where a.actual is null)) into summary
 from public.members m left join public.event_attendance a on a.member_id=m.id and a.event_id=p_event where m.status='active' or a.id is not null;
 select count(*) into total from public.members m left join public.event_attendance a on a.member_id=m.id and a.event_id=p_event
 where (m.status='active' or a.id is not null) and (p_response='all' or coalesce(a.response,'unanswered')=p_response);
 select coalesce(jsonb_agg(x.data order by x.name,x.id),'[]') into rows from (
  select m.id,m.name,jsonb_build_object('member',jsonb_build_object('id',m.id,'name',m.name,'position',m.position,'avatar_path',m.avatar_path),
   'attendance',case when a.id is null then null else to_jsonb(a) end) as data
  from public.members m left join public.event_attendance a on a.member_id=m.id and a.event_id=p_event
  where (m.status='active' or a.id is not null) and (p_response='all' or coalesce(a.response,'unanswered')=p_response)
  order by m.name,m.id limit 30 offset p_page*30
 ) x;
 return jsonb_build_object('event',to_jsonb(e),'summary',summary,'total',total,
  'members',(select coalesce(jsonb_agg(r->'member'),'[]') from jsonb_array_elements(rows) r),
  'attendance',(select coalesce(jsonb_agg(r->'attendance'),'[]') from jsonb_array_elements(rows) r where r->'attendance'<>'null'::jsonb));
end; $$;
create function public.admin_dues_summary(p_month date,p_member uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'invalid report range'; end if;
 select jsonb_build_object('registered',count(*),'paid',count(*) filter(where status='paid'),'unpaid',count(*) filter(where status='unpaid'),
  'exempt',count(*) filter(where status='exempt'),'unregistered',(select count(*) from public.members m where m.status='active'
   and m.joined_on<(p_month+interval '1 month')::date and (p_member is null or m.id=p_member)
   and not exists(select 1 from public.membership_payments d where d.member_id=m.id and d.month=p_month)))
 into result from public.membership_payments p where p.month=p_month and (p_member is null or p.member_id=p_member);
 return result;
end; $$;

create function public.admin_dashboard(p_event uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.events; today date:=(now() at time zone 'Asia/Seoul')::date; recent jsonb; today_events jsonb; counts jsonb; guests jsonb;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 select coalesce(jsonb_agg(to_jsonb(ev) order by ev.starts_at,ev.id),'[]') into today_events from public.events ev
 where (ev.starts_at at time zone 'Asia/Seoul')::date=today and ev.status in ('scheduled','completed') and ev.kind<>'holiday';
 if p_event is not null then
  select * into e from public.events where id=p_event and status in ('scheduled','completed') and kind<>'holiday';
  if e.id is null then raise exception 'event unavailable'; end if;
 else
  select * into e from public.events where status in ('scheduled','completed') and kind<>'holiday'
  and ((starts_at at time zone 'Asia/Seoul')::date=today or (starts_at>now() and status='scheduled'))
  order by case when (starts_at at time zone 'Asia/Seoul')::date=today then 0 else 1 end, starts_at,id limit 1;
 end if;
 counts:=case when e.id is null then jsonb_build_object('members',0,'guests',0,'total',0) else public.event_counts(e.id) end;
 guests:=case when e.id is null then jsonb_build_object('applications',0,'paid',0,'pending',0) else public.admin_guest_counts(e.id) end;
 select coalesce(jsonb_agg(x.data order by x.submitted_at desc,x.id),'[]') into recent from (
  select a.id,a.submitted_at,to_jsonb(a)||jsonb_build_object('guests',to_jsonb(g),'events',to_jsonb(ev),'guest_payments',to_jsonb(p)) as data
  from public.guest_applications a join public.guests g on g.id=a.guest_id join public.events ev on ev.id=a.event_id
  left join public.guest_payments p on p.application_id=a.id order by a.submitted_at desc,a.id limit 5
 ) x;
 return jsonb_build_object('event',case when e.id is null then null else to_jsonb(e) end,'today_events',today_events,'counts',counts,'guest_summary',guests,'recent_guests',recent,
  'tasks',jsonb_build_object('pending_guests',(select count(*) from public.guest_payments where status='pending'),
   'pending_members',(select count(*) from public.member_applications where status='pending'),
   'unpaid_members',(select count(*) from public.membership_payments where month=date_trunc('month',today)::date and status='unpaid'),
   'unanswered',case when e.id is null then 0 else (select count(*) from public.members m where m.status='active' and not exists(
    select 1 from public.event_attendance a where a.event_id=e.id and a.member_id=m.id and a.response in ('yes','no'))) end));
end; $$;

revoke all on function private.member_attendance_summary(uuid,integer),private.member_attendance_report(uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.my_attendance_report(integer,integer),public.admin_attendance_report(uuid,integer,integer),public.admin_member_summary(uuid),public.admin_dues_summary(date,uuid),public.admin_dashboard(uuid) from public,anon;
grant execute on function public.my_attendance_report(integer,integer),public.admin_attendance_report(uuid,integer,integer),public.admin_member_summary(uuid),public.admin_dues_summary(date,uuid),public.admin_dashboard(uuid) to authenticated;
revoke all on function public.admin_event_attendance(uuid,text,integer) from public,anon;
grant execute on function public.admin_event_attendance(uuid,text,integer) to authenticated;
