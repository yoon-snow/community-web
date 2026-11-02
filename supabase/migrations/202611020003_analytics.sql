create function public.publish_emergencies() returns void language plpgsql security definer set search_path='' as $$
declare n record; u record;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 for n in select * from public.announcements where kind='emergency' and starts_at<=now() and (ends_at is null or ends_at>now()) loop
  for u in select m.user_id from public.members m where m.status='active' and m.user_id is not null and (n.audience<>'admin' or exists(select 1 from public.admins a where a.member_id=m.id)) loop
   perform private.notify(u.user_id,n.title,'긴급공지를 확인해주세요.','/notices',case when n.audience='admin' then 'admin_emergency' else 'emergency' end,'emergency:'||n.id||':'||n.updated_at);
  end loop;
 end loop;
end; $$;
create function public.club_analytics(p_month date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; next_month date;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
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
  'payment_rate',(select case when count(*)=0 then 0 else round(100.0*count(*) filter(where status in ('paid','exempt'))/count(*)) end from public.membership_payments where month=p_month),
  'new_guests',(select count(*) from public.guests where (created_at at time zone 'Asia/Seoul')::date>=p_month and (created_at at time zone 'Asia/Seoul')::date<next_month),
  'returning_guests',(select count(distinct a.guest_id) from public.guest_applications a where (a.submitted_at at time zone 'Asia/Seoul')::date>=p_month and (a.submitted_at at time zone 'Asia/Seoul')::date<next_month and exists(select 1 from public.guest_applications b where b.guest_id=a.guest_id and b.submitted_at<a.submitted_at)),
  'average_participants',(select coalesce(round(avg(total)),0) from (select e.id,(select count(*) from public.event_attendance a where a.event_id=e.id and a.actual=true)+(select count(*) from public.guest_applications g join public.guest_payments p on p.application_id=g.id where g.event_id=e.id and p.status='paid') as total from public.events e where (e.starts_at at time zone 'Asia/Seoul')::date>=p_month and (e.starts_at at time zone 'Asia/Seoul')::date<next_month and e.ends_at<now() and e.status not in ('deleted','cancelled') and e.kind<>'holiday') q),
  'unanswered',(select count(*) from public.members m where m.status='active' and not exists(select 1 from public.event_attendance a where a.member_id=m.id and a.event_id=(select id from public.events where starts_at>now() and status='scheduled' and kind<>'holiday' order by starts_at limit 1) and a.response<>'unanswered')),
  'positions',(select coalesce(jsonb_agg(x),'[]') from (select g.position as label,count(*) as value from public.guest_applications a join public.guests g on g.id=a.guest_id where (a.submitted_at at time zone 'Asia/Seoul')::date>=p_month and (a.submitted_at at time zone 'Asia/Seoul')::date<next_month group by g.position) x),
  'sources',(select coalesce(jsonb_agg(x),'[]') from (select coalesce(a.answers->>'source','기타') as label,count(*) as value from public.guest_applications a where (a.submitted_at at time zone 'Asia/Seoul')::date>=p_month and (a.submitted_at at time zone 'Asia/Seoul')::date<next_month group by a.answers->>'source') x),
  'experience',(select coalesce(jsonb_agg(x),'[]') from (select coalesce(answers->>'experience','미입력') as label,count(*) as value from public.guest_applications where (submitted_at at time zone 'Asia/Seoul')::date>=p_month and (submitted_at at time zone 'Asia/Seoul')::date<next_month group by answers->>'experience') x),
  'weekdays',(select coalesce(jsonb_agg(x),'[]') from (select extract(isodow from submitted_at at time zone 'Asia/Seoul')::text as label,count(*) as value from public.guest_applications where (submitted_at at time zone 'Asia/Seoul')::date>=p_month and (submitted_at at time zone 'Asia/Seoul')::date<next_month group by label order by label) x),
  'monthly',(select coalesce(jsonb_agg(x),'[]') from (select to_char(submitted_at at time zone 'Asia/Seoul','YYYY-MM') as label,count(*) as value from public.guest_applications where submitted_at>=p_month-interval '5 months' and submitted_at<next_month group by label order by label) x),
  'member_attendance',(select coalesce(jsonb_agg(x),'[]') from (select m.id,m.name as label,count(a.id) filter(where a.actual=true) as value,max(e.starts_at) filter(where a.actual=true) as last_attended from public.members m left join public.event_attendance a on a.member_id=m.id left join public.events e on e.id=a.event_id where m.status='active' group by m.id order by value desc) x)
 ) into result;
 return result;
end; $$;
revoke all on function public.publish_emergencies(),public.club_analytics(date) from public,anon;
grant execute on function public.publish_emergencies(),public.club_analytics(date) to authenticated;
