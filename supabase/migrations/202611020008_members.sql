-- Preserve stable member UUIDs, applications, attendance, dues and existing role arrays.
alter table public.member_applications add column review_note text not null default '', add column reviewed_at timestamptz;

create table public.member_name_requests (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id),
 previous_name text not null, requested_name text not null check(length(requested_name) between 1 and 80),
 reason text not null default '' check(length(reason)<=1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 review_note text not null default '', submitted_at timestamptz not null default now(),
 reviewed_at timestamptz, reviewed_by uuid references auth.users(id)
);
create unique index one_pending_member_name on public.member_name_requests(member_id) where status='pending';
alter table public.member_name_requests enable row level security;
revoke all on public.member_name_requests from public,anon,authenticated;
grant all on public.member_name_requests to service_role;
grant select on public.member_name_requests to authenticated;
create policy own_name_requests on public.member_name_requests for select to authenticated using(member_id=private.my_member_id() or private.is_admin());
create trigger audit_change after insert or update or delete on public.member_name_requests for each row execute function private.audit();

-- Future directory opt-in is separate from the private member record. No directory is public by default.
create table public.member_directory_preferences (
 member_id uuid primary key references public.members(id),
 show_name boolean not null default false, show_photo boolean not null default false,
 show_position boolean not null default false, updated_at timestamptz not null default now()
);
alter table public.member_directory_preferences enable row level security;
revoke all on public.member_directory_preferences from public,anon,authenticated;
grant all on public.member_directory_preferences to service_role;
grant select on public.member_directory_preferences to authenticated;
create policy own_directory_preferences on public.member_directory_preferences for select to authenticated using(member_id=private.my_member_id() or private.is_admin());

create function public.request_member_name(p_name text,p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare m public.members; result uuid; u record;
begin
 if not private.is_member() then raise exception 'forbidden'; end if;
 select * into m from public.members where id=private.my_member_id() for update;
 if p_name is null or length(trim(p_name)) not between 1 and 80 or p_reason is null or length(p_reason)>1000 or trim(p_name)=m.name then raise exception 'invalid name request'; end if;
 insert into public.member_name_requests(member_id,previous_name,requested_name,reason) values(m.id,m.name,trim(p_name),trim(p_reason)) returning id into result;
 for u in select x.user_id from public.members x join public.admins a on a.member_id=x.id where x.status='active' and x.user_id is not null loop
  perform private.notify(u.user_id,'이름 변경 요청이 들어왔습니다.','회원 관리에서 요청을 검토해주세요.','/admin/members','admin_name_request','name-request:'||result);
 end loop;
 return result;
end; $$;
create function public.review_member_name(p_request uuid,p_status text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare r public.member_name_requests; m public.members;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if p_status is null or p_status not in ('approved','rejected') or p_note is null or length(p_note)>1000 then raise exception 'invalid name request'; end if;
 -- Consistent member -> request lock order with request_member_name.
 select * into m from public.members where id=(select member_id from public.member_name_requests where id=p_request) for update;
 select * into r from public.member_name_requests where id=p_request for update;
 if r.id is null or r.status<>'pending' then raise exception 'invalid name request'; end if;
 if p_status='approved' then
  if m.status<>'active' or m.name<>r.previous_name then raise exception 'name changed'; end if;
  update public.members set name=r.requested_name where id=r.member_id;
 end if;
 update public.member_name_requests set status=p_status,review_note=trim(p_note),reviewed_at=now(),reviewed_by=auth.uid() where id=r.id;
 if m.user_id is not null then perform private.notify(m.user_id,'이름 변경 요청 결과를 확인해주세요.','내 프로필에서 처리 결과를 확인할 수 있습니다.','/profile','profile_change','name-review:'||r.id); end if;
end; $$;

-- Keep the original profile RPC contract, but names now require approval.
-- Photo mutation is isolated so a stale profile form cannot restore a deleted photo.
create or replace function public.update_my_profile(p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare m public.members;
begin
 if not private.is_member() then raise exception 'forbidden'; end if;
 select * into m from public.members where id=private.my_member_id() for update;
 if p_data ? 'name' and p_data->>'name' is distinct from m.name then raise exception 'name approval required'; end if;
 if p_data->>'phone' is null or p_data->>'phone' !~ '^01[016789][0-9]{7,8}$' or length(coalesce(p_data->>'position',''))>80 or length(coalesce(p_data->>'experience',''))>200 then raise exception 'invalid profile'; end if;
 if p_data ? 'avatar_path' and p_data->>'avatar_path' is distinct from m.avatar_path then raise exception 'use avatar command'; end if;
 update public.members set phone=p_data->>'phone',position=coalesce(p_data->>'position',''),experience=coalesce(p_data->>'experience','') where id=m.id;
end; $$;
create function public.set_my_avatar(p_path text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_member() then raise exception 'forbidden'; end if;
 if p_path is not null and (p_path not like auth.uid()::text||'/%' or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_path)) then raise exception 'invalid avatar'; end if;
 update public.members set avatar_path=p_path where id=private.my_member_id();
end; $$;

create function public.my_activity_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; today date:=(now() at time zone 'Asia/Seoul')::date; m uuid;
begin
 if not private.is_member() then raise exception 'forbidden'; end if;
 m:=private.my_member_id();
 select jsonb_build_object(
  'year_attendance',count(*) filter(where (e.starts_at at time zone 'Asia/Seoul')::date>=date_trunc('year',today)::date),
  'month_attendance',count(*) filter(where (e.starts_at at time zone 'Asia/Seoul')::date>=date_trunc('month',today)::date),
  'last_attended_at',max(e.starts_at),
  'current_month_payment',(select jsonb_build_object('status',p.status,'amount',p.amount,'month',p.month) from public.membership_payments p where p.member_id=m and p.month=date_trunc('month',today)::date)
 ) into result from public.event_attendance a join public.events e on e.id=a.event_id
 where a.member_id=m and a.actual=true and e.ends_at<=now() and e.status in ('scheduled','completed');
 return result;
end; $$;

create function public.review_membership_with_note(p_application uuid,p_status text,p_member uuid default null,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if p_note is null or length(p_note)>1000 then raise exception 'invalid review'; end if;
 perform public.review_membership(p_application,p_status,p_member);
 update public.member_applications set review_note=trim(p_note),reviewed_at=now() where id=p_application;
end; $$;
revoke all on function public.request_member_name(text,text),public.review_member_name(uuid,text,text),public.set_my_avatar(text),public.my_activity_summary(),public.review_membership_with_note(uuid,text,uuid,text) from public,anon;
grant execute on function public.request_member_name(text,text),public.review_member_name(uuid,text,text),public.set_my_avatar(text),public.my_activity_summary(),public.review_membership_with_note(uuid,text,uuid,text) to authenticated;
