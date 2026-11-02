-- Additive upgrade: preserve existing entities, IDs, attendance and payment history.
-- Creation, inbox reads and Push delivery each independently enforce Admin-only operations.
create or replace function private.notification_requires_admin(p_kind text,p_href text)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(starts_with(p_kind,'admin_'),false)
 or coalesce(p_kind in ('guest_application','new_guest_application','guest_application_created','guest_payment','guest_payment_confirmed','participant_list','participant_roster','daily_roster','roster_ready'),false)
 or coalesce(p_href ~ '^/admin([/?#]|$)',false);
$$;
revoke all on function private.notification_requires_admin(text,text) from public,anon;
grant execute on function private.notification_requires_admin(text,text) to authenticated;

create or replace function private.notify(p_user uuid,p_title text,p_body text,p_href text,p_kind text,p_dedupe text)
returns void language plpgsql security definer set search_path='' as $$
declare n uuid;
begin
 if private.notification_requires_admin(p_kind,p_href) and not exists(
  select 1 from public.members m join public.admins a on a.member_id=m.id
  where m.user_id=p_user and m.status='active'
 ) then return; end if;
 insert into public.notifications(user_id,title,body,href,kind,dedupe_key)
 values(p_user,p_title,p_body,p_href,p_kind,p_dedupe)
 on conflict(user_id,dedupe_key) do nothing returning id into n;
 if n is not null then insert into public.push_outbox(notification_id) values(n); end if;
end;
$$;

-- Preserve historical notifications, but hide any operational messages from non-admins.
drop policy if exists own_notification on public.notifications;
create policy own_notification on public.notifications for select to authenticated using(
 user_id=auth.uid() and private.is_member()
 and (not private.notification_requires_admin(kind,href) or private.is_admin())
);
-- Retire queued historical misdeliveries without deleting the original notification/history.
update public.push_outbox o set delivered_at=now(),claimed_until=null,last_error='ineligible operational recipient'
from public.notifications n
where o.notification_id=n.id and o.delivered_at is null
and private.notification_requires_admin(n.kind,n.href)
and not exists(select 1 from public.members m join public.admins a on a.member_id=m.id where m.user_id=n.user_id and m.status='active');

create or replace function private.application_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare u record; notification_title text; notification_href text; event_time timestamp;
begin
 if TG_TABLE_NAME='guest_applications' then
  select starts_at at time zone 'Asia/Seoul' into event_time from public.events where id=NEW.event_id;
  notification_title:=extract(month from event_time)::integer||'월 '||extract(day from event_time)::integer||'일 게스트 신청이 들어왔습니다.';
  notification_href:='/admin/guests?application='||NEW.id||'&event='||NEW.event_id;
 else
  notification_title:='새 회원가입 신청이 들어왔습니다.';
  notification_href:='/admin/members';
 end if;
 for u in select m.user_id from public.members m join public.admins a on a.member_id=m.id where m.status='active' and m.user_id is not null loop
  perform private.notify(u.user_id,notification_title,'앱에서 신청 내용을 확인해주세요.',notification_href,'admin_application',TG_TABLE_NAME||':'||NEW.id);
 end loop;
 return NEW;
end;
$$;

-- Separate Admin-only totals. The member-facing event_counts RPC remains unchanged,
-- returning only {members,guests,total}, where guests includes verified paid applications.
create or replace function public.admin_guest_counts(p_event uuid default null,p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if p_from is not null and p_to is not null and p_from>p_to then raise exception 'invalid date range'; end if;
 select jsonb_build_object(
  'applications',count(*),
  'paid',count(*) filter(where p.status='paid'),
  'pending',count(*) filter(where p.status is distinct from 'paid')
 ) into result
 from public.guest_applications a left join public.guest_payments p on p.application_id=a.id
 where (p_event is null or a.event_id=p_event)
 and (p_from is null or (a.submitted_at at time zone 'Asia/Seoul')::date>=p_from)
 and (p_to is null or (a.submitted_at at time zone 'Asia/Seoul')::date<=p_to);
 return result;
end;
$$;
revoke all on function public.admin_guest_counts(uuid,date,date) from public,anon;
grant execute on function public.admin_guest_counts(uuid,date,date) to authenticated;

-- Private clock parameter enables deterministic 12:59/13:00 regression tests.
-- Production calls only daily_notifications(), which always supplies now().
create or replace function private.prepare_daily_rosters(p_now timestamptz) returns integer
language plpgsql security definer set search_path='' as $$
declare e record; u record; local_time timestamp; created integer:=0;
begin
 local_time:=p_now at time zone 'Asia/Seoul';
 if local_time::time<'13:00' then return 0; end if;
 for e in select id,title from public.events where (starts_at at time zone 'Asia/Seoul')::date=local_time::date and status='scheduled' and kind<>'holiday' loop
  for u in select m.user_id from public.members m join public.admins a on a.member_id=m.id where m.status='active' and m.user_id is not null loop
   if not exists(select 1 from public.notifications where user_id=u.user_id and dedupe_key='roster:'||e.id||':'||local_time::date) then
    perform private.notify(u.user_id,'오늘 SpotLight 참가자 명단이 준비되었습니다.',e.title,'/admin/roster?event='||e.id,'admin_roster','roster:'||e.id||':'||local_time::date);
    created:=created+1;
   end if;
  end loop;
 end loop;
 return created;
end;
$$;
revoke all on function private.prepare_daily_rosters(timestamptz) from public,anon,authenticated;

create or replace function public.daily_notifications() returns integer
language plpgsql security definer set search_path='' as $$
declare n record; u record; c integer;
begin
 c:=private.prepare_daily_rosters(now());
 -- Retain existing emergency notices and their audience-specific delivery.
 for n in select * from public.announcements where kind='emergency' and starts_at<=now() and (ends_at is null or ends_at>now()) loop
  for u in select m.user_id from public.members m where m.status='active' and m.user_id is not null and (n.audience<>'admin' or exists(select 1 from public.admins a where a.member_id=m.id)) loop
   perform private.notify(u.user_id,n.title,'긴급공지를 확인해주세요.','/notices',case when n.audience='admin' then 'admin_emergency' else 'emergency' end,'emergency:'||n.id||':'||n.updated_at);
  end loop;
 end loop;
 return c;
end;
$$;
-- CREATE OR REPLACE preserves the original service_role-only public RPC grant.
revoke all on function private.notify(uuid,text,text,text,text,text),private.application_notification() from public,anon,authenticated;
