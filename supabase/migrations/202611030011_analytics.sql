-- Preserve all operational tables and rows; replace admin-only reporting only.
create or replace function public.club_analytics(p_month date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; next_month date;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'invalid month'; end if;
 next_month:=(p_month+interval '1 month')::date;
 select jsonb_build_object(
  'month',p_month,
  'active_members',(select count(*) from public.members where status='active'),
  'new_members',(select count(*) from public.members where joined_on>=p_month and joined_on<next_month),
  'guest_applications',(select count(*) from public.guest_applications where (submitted_at at time zone 'Asia/Seoul')::date>=p_month and (submitted_at at time zone 'Asia/Seoul')::date<next_month),
  'paid_guests',(select count(*) from public.guest_applications a join public.guest_payments p on p.application_id=a.id where (a.submitted_at at time zone 'Asia/Seoul')::date>=p_month and (a.submitted_at at time zone 'Asia/Seoul')::date<next_month and p.status='paid'),
  'pending_guests',(select count(*) from public.guest_payments where status='pending'),
  'pending_members',(select count(*) from public.member_applications where status='pending'),
  'unpaid_members',(select count(*) from public.membership_payments where month=p_month and status='unpaid'),
  'payment_rate',(select case when count(*)=0 then 0 else round(100.0*count(*) filter(where status='paid')/nullif(count(*) filter(where status<>'exempt'),0)) end from public.membership_payments where month=p_month),
  'new_guests',(select count(*) from public.guests where (created_at at time zone 'Asia/Seoul')::date>=p_month and (created_at at time zone 'Asia/Seoul')::date<next_month),
  'returning_guests',(select count(distinct a.guest_id) from public.guest_applications a where (a.submitted_at at time zone 'Asia/Seoul')::date>=p_month and (a.submitted_at at time zone 'Asia/Seoul')::date<next_month and exists(select 1 from public.guest_applications b where b.guest_id=a.guest_id and b.submitted_at<a.submitted_at)),
  'average_participants',(select coalesce(round(avg(total)),0) from (select e.id,(select count(*) from public.event_attendance a where a.event_id=e.id and a.actual=true)+(select count(*) from public.guest_applications g join public.guest_payments p on p.application_id=g.id where g.event_id=e.id and p.status='paid') as total from public.events e where (e.starts_at at time zone 'Asia/Seoul')::date>=p_month and (e.starts_at at time zone 'Asia/Seoul')::date<next_month and e.ends_at<now() and e.status not in ('deleted','cancelled') and e.kind<>'holiday') q),
  'unanswered',(select count(*) from public.members m where m.status='active' and not exists(select 1 from public.event_attendance a where a.member_id=m.id and a.event_id=(select id from public.events where starts_at>now() and status='scheduled' and kind<>'holiday' order by starts_at limit 1) and a.response<>'unanswered')),
  'positions',(select coalesce(jsonb_agg(x),'[]') from (select coalesce(nullif(a.answers->>'position',''),nullif(g.position,''),'미입력') as label,count(*) as value from public.guest_applications a join public.guests g on g.id=a.guest_id where (a.submitted_at at time zone 'Asia/Seoul')::date>=p_month and (a.submitted_at at time zone 'Asia/Seoul')::date<next_month group by label) x),
  'sources',(select coalesce(jsonb_agg(x),'[]') from (select coalesce(nullif(a.answers->>'source',''),nullif(a.answers->>'SpotLight를 알게 된 경로',''),nullif(a.answers->'source_record'->>'SpotLight를 알게 된 경로',''),'미입력') as label,count(*) as value from public.guest_applications a where (a.submitted_at at time zone 'Asia/Seoul')::date>=p_month and (a.submitted_at at time zone 'Asia/Seoul')::date<next_month group by label) x),
  'experience',(select coalesce(jsonb_agg(x),'[]') from (select coalesce(answers->>'experience','미입력') as label,count(*) as value from public.guest_applications where (submitted_at at time zone 'Asia/Seoul')::date>=p_month and (submitted_at at time zone 'Asia/Seoul')::date<next_month group by answers->>'experience') x),
  'weekdays',(select coalesce(jsonb_agg(x),'[]') from (select extract(isodow from submitted_at at time zone 'Asia/Seoul')::text as label,count(*) as value from public.guest_applications where (submitted_at at time zone 'Asia/Seoul')::date>=p_month and (submitted_at at time zone 'Asia/Seoul')::date<next_month group by label order by label) x),
  'monthly',(select coalesce(jsonb_agg(x),'[]') from (select to_char(submitted_at at time zone 'Asia/Seoul','YYYY-MM') as label,count(*) as value from public.guest_applications where submitted_at>=p_month-interval '5 months' and submitted_at<next_month group by label order by label) x),
  'member_attendance',(select coalesce(jsonb_agg(x),'[]') from (select m.id,m.name as label,count(a.id) filter(where a.actual=true) as value,max(e.starts_at) filter(where a.actual=true) as last_attended from public.members m left join public.event_attendance a on a.member_id=m.id left join public.events e on e.id=a.event_id where m.status='active' group by m.id order by value desc) x)
 ) into result;
 with months as (
 select d::date as month from generate_series(p_month-interval '5 months',p_month,interval '1 month') d
 ), workouts as (
 select e.id,e.starts_at,(e.starts_at at time zone 'Asia/Seoul')::date as day,
 (select count(*) from public.event_attendance a where a.event_id=e.id and a.actual=true) as members,
 (select count(*) from public.guest_applications a where a.event_id=e.id and a.actual_attended=true) as guests
 from public.events e where e.ends_at<=now() and e.status in ('scheduled','completed') and e.kind<>'holiday'
 ), visits as (
 select a.guest_id,min(w.day) as first_day from public.guest_applications a join workouts w on w.id=a.event_id
 where a.actual_attended=true group by a.guest_id
 ), month_visitors as (
 select distinct a.guest_id from public.guest_applications a join workouts w on w.id=a.event_id
 where a.actual_attended=true and w.day>=p_month and w.day<next_month
 ), member_counts as (
 select m.id,m.name,count(w.id) filter(where w.day>=p_month and w.day<next_month) as value,max(w.starts_at) as last_attended,m.joined_on
 from public.members m left join public.event_attendance a on a.member_id=m.id and a.actual=true
 left join workouts w on w.id=a.event_id where m.status='active' group by m.id
 ), totals as (
 select coalesce(sum(members),0) as members,coalesce(sum(guests),0) as guests,coalesce(round(avg(members+guests),1),0) as average from workouts where day>=p_month and day<next_month
 ) select result || jsonb_build_object(
 'payment_rate',coalesce((result->>'payment_rate')::numeric,0),
 'new_guests',(select count(*) from month_visitors m join visits v using(guest_id) where v.first_day>=p_month),
 'returning_guests',(select count(*) from month_visitors m join visits v using(guest_id) where v.first_day<p_month),
 'return_rate',(select coalesce(round(100.0*count(*) filter(where v.first_day<p_month)/nullif(count(*),0),1),0) from month_visitors m join visits v using(guest_id)),
 'average_participants',(select average from totals),
 'average_attendance',(select coalesce(round(avg(value),1),0) from member_counts),
 'member_attendance',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',name,'value',value) order by value desc,name,id),'[]') from member_counts),
 'inactive_members',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'last_attended',last_attended) order by last_attended nulls first,id),'[]') from member_counts where joined_on <= (now() at time zone 'Asia/Seoul')::date-90 and (last_attended is null or last_attended<now()-interval '90 days')),
 'participant_ratio',(select jsonb_build_array(jsonb_build_object('label','회원','value',coalesce(round(100.0*members/nullif(members+guests,0),1),0)),jsonb_build_object('label','게스트','value',coalesce(round(100.0*guests/nullif(members+guests,0),1),0))) from totals),
 'monthly_members',(select jsonb_agg(jsonb_build_object('label',to_char(month,'YYYY-MM'),'value',(select count(*) from public.members m where m.joined_on>=months.month and m.joined_on<months.month+interval '1 month')) order by month) from months),
 'monthly',(select jsonb_agg(jsonb_build_object('label',to_char(month,'YYYY-MM'),'value',(select count(*) from public.guest_applications a where (a.submitted_at at time zone 'Asia/Seoul')::date>=months.month and (a.submitted_at at time zone 'Asia/Seoul')::date<months.month+interval '1 month')) order by month) from months),
 'monthly_average',(select jsonb_agg(jsonb_build_object('label',to_char(month,'YYYY-MM'),'value',(select coalesce(round(avg(members+guests),1),0) from workouts w where w.day>=months.month and w.day<months.month+interval '1 month')) order by month) from months),
 'monthly_participants',(select jsonb_agg(jsonb_build_object('label',to_char(month,'YYYY-MM'),'value',(select coalesce(sum(members+guests),0) from workouts w where w.day>=months.month and w.day<months.month+interval '1 month')) order by month) from months)
 ) into result;
 return result;
end; $$;

revoke all on function public.club_analytics(date) from public,anon;
grant execute on function public.club_analytics(date) to authenticated;
