-- Apply in a dedicated Supabase project. All IDs are stable; no name-based relations.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
create table public.members (
 id uuid primary key default gen_random_uuid(), user_id uuid unique references auth.users(id),
 external_id text unique, name text not null check(length(name) between 1 and 80), phone text unique not null,
 birth_date date, gender text, position text not null default '', experience text not null default '',
 joined_on date not null default current_date, status text not null default 'active' check(status in ('active','inactive','withdrawn')),
 avatar_path text, created_at timestamptz not null default now()
);
create table public.member_notes (member_id uuid primary key references public.members(id), admin_memo text not null default '');
alter table public.member_notes enable row level security;
revoke all on public.member_notes from anon,authenticated;
grant all on public.member_notes to service_role;
create table public.admins (member_id uuid primary key references public.members(id), titles text[] not null default '{운영진}');
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.members m join public.admins a on a.member_id=m.id where m.user_id=auth.uid() and m.status='active'); $$;
create function private.is_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.members m where m.user_id=auth.uid() and m.status='active'); $$;
create function private.my_member_id() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.members where user_id=auth.uid() and status='active'; $$;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(),private.is_member(),private.my_member_id() to authenticated;

grant select,insert,update,delete on public.member_notes to authenticated;
create policy admin_only on public.member_notes for all to authenticated using(private.is_admin()) with check(private.is_admin());

create table public.events (
 id uuid primary key default gen_random_uuid(), external_id text unique, title text not null,
 starts_at timestamptz not null, ends_at timestamptz not null, location text not null,
 kind text not null check(kind in ('practice','lesson','game','match','event','holiday')),
 description text not null default '', guests_open boolean not null default false,
 guest_fee integer not null default 5000 check(guest_fee>=0),
 status text not null default 'scheduled' check(status in ('scheduled','cancelled','completed','deleted')),
 created_at timestamptz not null default now(), check(ends_at>starts_at)
);
create index on public.events(starts_at);
create table public.rules (
 id uuid primary key default gen_random_uuid(), category text not null unique, title text not null, current_version integer not null default 1
);
create table public.rule_versions (
 id uuid primary key default gen_random_uuid(), rule_id uuid not null references public.rules(id), version integer not null,
 content text not null, published boolean not null default false, updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(), unique(rule_id,version)
);
create table public.guests (
 id uuid primary key default gen_random_uuid(), external_id text unique, name text not null, phone text unique not null,
 position text not null default '', created_at timestamptz not null default now()
);
create table public.guest_applications (
 id uuid primary key default gen_random_uuid(), external_id text unique, guest_id uuid not null references public.guests(id),
 event_id uuid not null references public.events(id), answers jsonb not null, self_reported_paid boolean not null default false,
 rule_versions jsonb not null default '{}', submitted_at timestamptz not null default now(),
 unique(guest_id,event_id)
);
create table public.guest_payments (
 application_id uuid primary key references public.guest_applications(id),
 status text not null default 'pending' check(status in ('pending','paid')), amount integer not null check(amount>=0),
 verified_by uuid references auth.users(id), verified_at timestamptz
);
create table public.member_applications (
 id uuid primary key default gen_random_uuid(), external_id text unique, user_id uuid unique references auth.users(id),
 name text not null, phone text not null, answers jsonb not null, rule_versions jsonb not null default '{}',
 status text not null default 'pending' check(status in ('pending','approved','hold','rejected')),
 member_id uuid references public.members(id), submitted_at timestamptz not null default now(), reviewed_by uuid references auth.users(id)
);
create table public.event_attendance (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id), member_id uuid not null references public.members(id),
 response text not null default 'unanswered' check(response in ('yes','no','unanswered')),
 actual boolean, checked_by uuid references auth.users(id), updated_at timestamptz not null default now(), unique(event_id,member_id)
);
create table public.membership_payments (
 id uuid primary key default gen_random_uuid(), external_id text unique, member_id uuid not null references public.members(id),
 month date not null check(extract(day from month)=1), amount integer not null default 60000 check(amount>=0),
 status text not null default 'unpaid' check(status in ('paid','unpaid','exempt')), verified_by uuid references auth.users(id),
 unique(member_id,month)
);
create table public.uniforms (
 member_id uuid primary key references public.members(id), nickname text not null default '', number text not null default '', top_size text not null default '', bottom_size text not null default ''
);
create table public.announcements (
 id uuid primary key default gen_random_uuid(), title text not null, content text not null,
 kind text not null default 'general' check(kind in ('general','required','emergency','event')),
 audience text not null default 'public' check(audience in ('public','member','admin')),
 starts_at timestamptz not null default now(), ends_at timestamptz,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at is null or ends_at>starts_at)
);
create table public.video_playlists (
 id uuid primary key default gen_random_uuid(), title text not null, url text not null,
 playlist_id text not null unique, description text not null default '', visibility text not null default 'member' check(visibility in ('public','member')),
 created_at timestamptz not null default now()
);
create table public.videos (
 id uuid primary key default gen_random_uuid(), title text not null, description text not null default '', url text not null,
 video_id text, playlist_id text, thumbnail text, filmed_on date not null,
 kind text not null default 'game' check(kind in ('game','lesson','match','practice','event')),
 event_id uuid references public.events(id), visibility text not null default 'member' check(visibility in ('public','member')),
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), check(video_id is not null or playlist_id is not null)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), title text not null, body text not null default '',
 href text not null, kind text not null, dedupe_key text, read_at timestamptz, created_at timestamptz not null default now(), unique(user_id,dedupe_key)
);
create index on public.notifications(user_id,created_at desc);
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), endpoint text unique not null,
 p256dh text not null, auth text not null, created_at timestamptz not null default now()
);
create table public.push_outbox (
 id uuid primary key default gen_random_uuid(), notification_id uuid not null unique references public.notifications(id),
 attempts integer not null default 0, delivered_at timestamptz, claimed_until timestamptz,
 last_error text, created_at timestamptz not null default now()
);
create table public.form_questions (
 id uuid primary key default gen_random_uuid(), form text not null check(form in ('guest','member')), key text not null,
 label text not null, type text not null check(type in ('text','textarea','select')), options jsonb not null default '[]',
 required boolean not null default false, active boolean not null default true, sort_order integer not null default 0, unique(form,key)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id), action text not null,
 entity text not null, entity_id text, created_at timestamptz not null default now()
);
create table public.import_batches (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), entity text not null,
 rows jsonb not null, summary jsonb not null, digest text not null, created_at timestamptz not null default now(), committed_at timestamptz
);
create table private.rate_limits (key text primary key, hits integer not null default 1, expires_at timestamptz not null);

-- Default deny; grants/policies below deliberately opt in.
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;
grant all on public.members to service_role;
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant all on public.admins to service_role;
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant all on public.events to service_role;
alter table public.rules enable row level security;
revoke all on public.rules from anon, authenticated;
grant all on public.rules to service_role;
alter table public.rule_versions enable row level security;
revoke all on public.rule_versions from anon, authenticated;
grant all on public.rule_versions to service_role;
alter table public.guests enable row level security;
revoke all on public.guests from anon, authenticated;
grant all on public.guests to service_role;
alter table public.guest_applications enable row level security;
revoke all on public.guest_applications from anon, authenticated;
grant all on public.guest_applications to service_role;
alter table public.guest_payments enable row level security;
revoke all on public.guest_payments from anon, authenticated;
grant all on public.guest_payments to service_role;
alter table public.member_applications enable row level security;
revoke all on public.member_applications from anon, authenticated;
grant all on public.member_applications to service_role;
alter table public.event_attendance enable row level security;
revoke all on public.event_attendance from anon, authenticated;
grant all on public.event_attendance to service_role;
alter table public.membership_payments enable row level security;
revoke all on public.membership_payments from anon, authenticated;
grant all on public.membership_payments to service_role;
alter table public.uniforms enable row level security;
revoke all on public.uniforms from anon, authenticated;
grant all on public.uniforms to service_role;
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant all on public.announcements to service_role;
alter table public.video_playlists enable row level security;
revoke all on public.video_playlists from anon, authenticated;
grant all on public.video_playlists to service_role;
alter table public.videos enable row level security;
revoke all on public.videos from anon, authenticated;
grant all on public.videos to service_role;
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant all on public.notifications to service_role;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;
grant all on public.push_outbox to service_role;
alter table public.form_questions enable row level security;
revoke all on public.form_questions from anon, authenticated;
grant all on public.form_questions to service_role;
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant all on public.audit_logs to service_role;
alter table public.import_batches enable row level security;
revoke all on public.import_batches from anon, authenticated;
grant all on public.import_batches to service_role;
grant select on public.members to authenticated;
create policy admin_read on public.members for select to authenticated using(private.is_admin());
grant select on public.admins to authenticated;
create policy admin_read on public.admins for select to authenticated using(private.is_admin());
grant select on public.events to authenticated;
create policy admin_read on public.events for select to authenticated using(private.is_admin());
grant select on public.rules to authenticated;
create policy admin_read on public.rules for select to authenticated using(private.is_admin());
grant select on public.rule_versions to authenticated;
create policy admin_read on public.rule_versions for select to authenticated using(private.is_admin());
grant select on public.guests to authenticated;
create policy admin_read on public.guests for select to authenticated using(private.is_admin());
grant select on public.guest_applications to authenticated;
create policy admin_read on public.guest_applications for select to authenticated using(private.is_admin());
grant select on public.guest_payments to authenticated;
create policy admin_read on public.guest_payments for select to authenticated using(private.is_admin());
grant select on public.member_applications to authenticated;
create policy admin_read on public.member_applications for select to authenticated using(private.is_admin());
grant select on public.event_attendance to authenticated;
create policy admin_read on public.event_attendance for select to authenticated using(private.is_admin());
grant select on public.membership_payments to authenticated;
create policy admin_read on public.membership_payments for select to authenticated using(private.is_admin());
grant select on public.uniforms to authenticated;
create policy admin_read on public.uniforms for select to authenticated using(private.is_admin());
grant select on public.announcements to authenticated;
create policy admin_read on public.announcements for select to authenticated using(private.is_admin());
grant select on public.video_playlists to authenticated;
create policy admin_read on public.video_playlists for select to authenticated using(private.is_admin());
grant select on public.videos to authenticated;
create policy admin_read on public.videos for select to authenticated using(private.is_admin());
grant select on public.notifications to authenticated;
create policy admin_read on public.notifications for select to authenticated using(private.is_admin());
grant select on public.push_subscriptions to authenticated;
create policy admin_read on public.push_subscriptions for select to authenticated using(private.is_admin());
grant select on public.form_questions to authenticated;
create policy admin_read on public.form_questions for select to authenticated using(private.is_admin());
grant select on public.audit_logs to authenticated;
create policy admin_read on public.audit_logs for select to authenticated using(private.is_admin());
grant insert,update,delete on public.members to authenticated;
create policy admin_write on public.members for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant insert,update,delete on public.admins to authenticated;
create policy admin_write on public.admins for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant insert,update,delete on public.events to authenticated;
create policy admin_write on public.events for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant insert,update,delete on public.membership_payments to authenticated;
create policy admin_write on public.membership_payments for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant insert,update,delete on public.uniforms to authenticated;
create policy admin_write on public.uniforms for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant insert,update,delete on public.announcements to authenticated;
create policy admin_write on public.announcements for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant insert,update,delete on public.video_playlists to authenticated;
create policy admin_write on public.video_playlists for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant insert,update,delete on public.videos to authenticated;
create policy admin_write on public.videos for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant insert,update,delete on public.form_questions to authenticated;
create policy admin_write on public.form_questions for all to authenticated using(private.is_admin()) with check(private.is_admin());

create policy own_member on public.members for select to authenticated using(user_id=auth.uid() and status='active');
create policy own_admin on public.admins for select to authenticated using(member_id=private.my_member_id());
create policy own_application on public.member_applications for select to authenticated using(user_id=auth.uid());
create policy own_attendance on public.event_attendance for select to authenticated using(member_id=private.my_member_id());
create policy own_payment on public.membership_payments for select to authenticated using(member_id=private.my_member_id());
create policy own_uniform on public.uniforms for select to authenticated using(member_id=private.my_member_id());
create policy own_notification on public.notifications for select to authenticated using(user_id=auth.uid() and (kind not like 'admin_%' or private.is_admin()));
create policy own_subscription on public.push_subscriptions for select to authenticated using(user_id=auth.uid());
grant select on public.events,public.rules,public.rule_versions,public.announcements,public.videos,public.video_playlists,public.form_questions to anon;
create policy public_events on public.events for select to anon,authenticated using(status<>'deleted');
create policy public_rules on public.rules for select to anon,authenticated using(true);
create policy public_rule_versions on public.rule_versions for select to anon,authenticated using(published);
create policy public_questions on public.form_questions for select to anon,authenticated using(active);
create policy visible_announcements on public.announcements for select to anon,authenticated using(
 starts_at<=now() and (ends_at is null or ends_at>now()) and
 (audience='public' or (audience='member' and private.is_member()))
);
create policy visible_videos on public.videos for select to anon,authenticated using(visibility='public' or private.is_member());
create policy visible_playlists on public.video_playlists for select to anon,authenticated using(visibility='public' or private.is_member());
-- anon needs only these predicate functions to evaluate public/member policies.
grant usage on schema private to anon;
grant execute on function private.is_member() to anon;

create function private.audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(auth.uid(),TG_OP,TG_TABLE_NAME,coalesce(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id',to_jsonb(NEW)->>'member_id'));
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end; $$;
create trigger audit_change after insert or update or delete on public.members for each row execute function private.audit();
create trigger audit_change after insert or update or delete on public.admins for each row execute function private.audit();
create trigger audit_change after insert or update or delete on public.guest_payments for each row execute function private.audit();
create trigger audit_change after insert or update or delete on public.member_applications for each row execute function private.audit();
create trigger audit_change after insert or update or delete on public.event_attendance for each row execute function private.audit();
create trigger audit_change after insert or update or delete on public.membership_payments for each row execute function private.audit();
create trigger audit_change after insert or update or delete on public.events for each row execute function private.audit();
create trigger audit_change after insert or update or delete on public.announcements for each row execute function private.audit();
create trigger audit_change after insert or update or delete on public.videos for each row execute function private.audit();
create trigger audit_change after insert or update or delete on public.rules for each row execute function private.audit();
create trigger audit_change after insert or update or delete on public.rule_versions for each row execute function private.audit();
create trigger audit_change after insert or update or delete on public.uniforms for each row execute function private.audit();

create function public.event_counts(p_event uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m integer; g integer;
begin
 if not private.is_member() then raise exception 'forbidden'; end if;
 select count(*) into m from public.event_attendance a join public.members x on x.id=a.member_id where a.event_id=p_event and a.response='yes' and x.status='active';
 select count(*) into g from public.guest_applications a join public.guest_payments p on p.application_id=a.id where a.event_id=p_event and p.status='paid';
 return jsonb_build_object('members',m,'guests',g,'total',m+g);
end; $$;

create function public.respond_event(p_event uuid,p_response text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_member() or p_response not in ('yes','no') then raise exception 'forbidden'; end if;
 if not exists(select 1 from public.events where id=p_event and starts_at>now() and status='scheduled' and kind<>'holiday') then raise exception 'event unavailable'; end if;
 insert into public.event_attendance(event_id,member_id,response) values(p_event,private.my_member_id(),p_response)
 on conflict(event_id,member_id) do update set response=excluded.response,updated_at=now();
end; $$;
create function public.check_attendance(p_event uuid,p_member uuid,p_actual boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if not exists(select 1 from public.events where id=p_event and ends_at<=now() and status not in ('cancelled','deleted','scheduled') or id=p_event and ends_at<=now() and status='scheduled') then raise exception 'event has not ended'; end if;
 insert into public.event_attendance(event_id,member_id,actual,checked_by) values(p_event,p_member,p_actual,auth.uid())
 on conflict(event_id,member_id) do update set actual=excluded.actual,checked_by=auth.uid(),updated_at=now();
end; $$;
create function public.confirm_guest_payment(p_application uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 update public.guest_payments set status='paid',verified_by=auth.uid(),verified_at=now() where application_id=p_application;
 if not found then raise exception 'not found'; end if;
end; $$;

create function private.notify(p_user uuid,p_title text,p_body text,p_href text,p_kind text,p_dedupe text) returns void language plpgsql security definer set search_path='' as $$
declare n uuid;
begin
 insert into public.notifications(user_id,title,body,href,kind,dedupe_key) values(p_user,p_title,p_body,p_href,p_kind,p_dedupe)
 on conflict(user_id,dedupe_key) do nothing returning id into n;
 if n is not null then insert into public.push_outbox(notification_id) values(n); end if;
end; $$;
create function private.application_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare u record; title text; href text;
begin
 title:=case when TG_TABLE_NAME='guest_applications' then '새 게스트 신청이 들어왔습니다.' else '새 회원가입 신청이 들어왔습니다.' end;
 href:=case when TG_TABLE_NAME='guest_applications' then '/admin/guests' else '/admin/members' end;
 for u in select m.user_id from public.members m join public.admins a on a.member_id=m.id where m.status='active' and m.user_id is not null loop
  perform private.notify(u.user_id,title,'앱에서 신청 내용을 확인해주세요.',href,'admin_application',TG_TABLE_NAME||':'||NEW.id);
 end loop; return NEW;
end; $$;
create trigger guest_notification after insert on public.guest_applications for each row execute function private.application_notification();
create trigger member_notification after insert on public.member_applications for each row execute function private.application_notification();
create function private.emergency_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Future notices are delivered by the cron publisher when their start time arrives.
 return NEW;
end; $$;

create function public.submit_guest(p_data jsonb,p_rate_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare g uuid; a uuid; e public.events; hits integer; rules jsonb;
begin
 delete from private.rate_limits where expires_at<now();
 insert into private.rate_limits(key,expires_at) values(p_rate_key,now()+interval '1 hour')
 on conflict(key) do update set hits=private.rate_limits.hits+1 returning private.rate_limits.hits into hits;
 if hits>8 then raise exception 'rate limit'; end if;
 select * into e from public.events where id=(p_data->>'event_id')::uuid and guests_open and status='scheduled' and starts_at>now() and kind<>'holiday';
 if e.id is null then raise exception 'event unavailable'; end if;
 if p_data->>'phone' !~ '^01[016789][0-9]{7,8}$' or length(p_data->>'name') not between 1 and 80 or not coalesce((p_data->>'privacy_consent')::boolean,false) or not coalesce((p_data->>'photo_consent')::boolean,false) or not coalesce((p_data->>'rules_consent')::boolean,false) then raise exception 'invalid application'; end if;
 select coalesce(jsonb_object_agg(r.id::text,r.current_version),'{}') into rules from public.rules r join public.rule_versions v on v.rule_id=r.id and v.version=r.current_version where v.published;
 if rules='{}'::jsonb then raise exception 'rules not configured'; end if;
 if coalesce(p_data->'rule_versions','{}')<>rules then raise exception 'rules changed'; end if;
 insert into public.guests(name,phone,position) values(p_data->>'name',p_data->>'phone',p_data->>'position')
 on conflict(phone) do update set phone=excluded.phone returning id into g;
 -- Existing identity is not renamed by an anonymous caller.
 insert into public.guest_applications(guest_id,event_id,answers,self_reported_paid,rule_versions)
 values(g,e.id,p_data,coalesce((p_data->>'self_reported_paid')::boolean,false),rules) returning id into a;
 insert into public.guest_payments(application_id,amount) values(a,e.guest_fee);
 return a;
end; $$;
create function public.submit_membership(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid; rules jsonb;
begin
 if auth.uid() is null or private.is_member() then raise exception 'forbidden'; end if;
 if p_data->>'phone' !~ '^01[016789][0-9]{7,8}$' or length(p_data->>'name') not between 1 and 80 or not coalesce((p_data->>'privacy_consent')::boolean,false) or not coalesce((p_data->>'photo_consent')::boolean,false) or not coalesce((p_data->>'rules_consent')::boolean,false) then raise exception 'invalid application'; end if;
 select coalesce(jsonb_object_agg(r.id::text,r.current_version),'{}') into rules from public.rules r join public.rule_versions v on v.rule_id=r.id and v.version=r.current_version where v.published;
 if rules='{}'::jsonb or coalesce(p_data->'rule_versions','{}')<>rules then raise exception 'rules changed'; end if;
 insert into public.member_applications(user_id,name,phone,answers,rule_versions) values(auth.uid(),p_data->>'name',p_data->>'phone',p_data,rules) returning id into a;
 return a;
end; $$;
create function public.review_membership(p_application uuid,p_status text,p_member uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare a public.member_applications; m uuid;
begin
 if not private.is_admin() or p_status not in ('approved','hold','rejected') then raise exception 'forbidden'; end if;
 select * into a from public.member_applications where id=p_application for update;
 if a.id is null or a.user_id is null or a.status='approved' then raise exception 'invalid application'; end if;
 if p_status='approved' then
  if p_member is not null then
   update public.members set user_id=a.user_id,status='active' where id=p_member and user_id is null and phone=a.phone returning id into m;
   if m is null then raise exception 'identity mismatch'; end if;
  else
   insert into public.members(user_id,name,phone,birth_date,gender,position,experience)
   values(a.user_id,a.name,a.phone,(a.answers->>'birth_date')::date,a.answers->>'gender',a.answers->>'position',a.answers->>'experience') returning id into m;
  end if;
 end if;
 update public.member_applications set status=p_status,member_id=m,reviewed_by=auth.uid() where id=a.id;
end; $$;
create function public.update_my_profile(p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_member() or length(p_data->>'name') not between 1 and 80 or p_data->>'phone' !~ '^01[016789][0-9]{7,8}$' then raise exception 'invalid profile'; end if;
 if p_data->>'avatar_path' is not null and p_data->>'avatar_path' not like auth.uid()::text||'/%' and p_data->>'avatar_path' is distinct from (select m.avatar_path from public.members m where m.id=private.my_member_id()) then raise exception 'invalid avatar'; end if;
 update public.members set name=p_data->>'name',phone=p_data->>'phone',position=p_data->>'position',experience=p_data->>'experience',avatar_path=p_data->>'avatar_path' where id=private.my_member_id();
end; $$;
create function public.mark_notification_read(p_id uuid) returns void language sql security definer set search_path='' as $$
 update public.notifications set read_at=now() where id=p_id and user_id=auth.uid(); $$;
create function public.save_push(p_endpoint text,p_p256dh text,p_auth text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_member() or p_endpoint !~ '^https://' or length(p_endpoint)>2048 or length(p_p256dh)>200 or length(p_auth)>200 then raise exception 'invalid subscription'; end if;
 insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values(auth.uid(),p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint) do update set user_id=auth.uid(),p256dh=excluded.p256dh,auth=excluded.auth where public.push_subscriptions.user_id=auth.uid();
end; $$;
create function public.publish_rule(p_category text,p_title text,p_content text) returns void language plpgsql security definer set search_path='' as $$
declare r uuid; v integer;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 insert into public.rules(category,title) values(p_category,p_title) on conflict(category) do nothing;
 select id,current_version into r,v from public.rules where category=p_category for update;
 if exists(select 1 from public.rule_versions where rule_id=r) then v:=v+1; end if;
 insert into public.rule_versions(rule_id,version,content,published,updated_by) values(r,v,p_content,true,auth.uid());
 update public.rules set title=p_title,current_version=v where id=r;
end; $$;
create function public.daily_notifications() returns integer language plpgsql security definer set search_path='' as $$
declare e record; u record; n record; c integer:=0; local_time timestamp;
begin
 local_time:=now() at time zone 'Asia/Seoul';
 if local_time::time>='13:00' then
 for e in select id,title from public.events where (starts_at at time zone 'Asia/Seoul')::date=local_time::date and status='scheduled' and kind<>'holiday' loop
  for u in select m.user_id from public.members m join public.admins a on a.member_id=m.id where m.status='active' and m.user_id is not null loop
   perform private.notify(u.user_id,'오늘 SpotLight 참가자 명단이 준비되었습니다.',e.title,'/admin/roster?event='||e.id,'admin_roster','roster:'||e.id||':'||local_time::date); c:=c+1;
  end loop;
 end loop;
 end if;
 for n in select * from public.announcements where kind='emergency' and starts_at<=now() and (ends_at is null or ends_at>now()) loop
  for u in select m.user_id from public.members m where m.status='active' and m.user_id is not null and (n.audience<>'admin' or exists(select 1 from public.admins a where a.member_id=m.id)) loop
   perform private.notify(u.user_id,n.title,'긴급공지를 확인해주세요.','/notices',case when n.audience='admin' then 'admin_emergency' else 'emergency' end,'emergency:'||n.id||':'||n.updated_at);
  end loop;
 end loop;
 return c;
end; $$;

-- Explicit RPC grants: no function is accidentally anonymous-callable.
revoke all on all functions in schema public from public,anon,authenticated;
grant execute on function public.event_counts(uuid),public.respond_event(uuid,text),public.check_attendance(uuid,uuid,boolean),public.confirm_guest_payment(uuid),public.submit_membership(jsonb),public.review_membership(uuid,text,uuid),public.update_my_profile(jsonb),public.mark_notification_read(uuid),public.save_push(text,text,text),public.publish_rule(text,text,text) to authenticated;
grant execute on function public.submit_guest(jsonb,text),public.daily_notifications() to service_role;
revoke all on all functions in schema private from public;
-- Private functions are never exposed as PostgREST RPCs.
grant execute on function private.is_admin(),private.is_member(),private.my_member_id() to authenticated;
grant execute on function private.is_member() to anon;

-- Private profile images. Avatars are signed per request; they are never public objects.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('avatars','avatars',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy avatar_read on storage.objects for select to authenticated using(bucket_id='avatars' and (private.is_admin() or (private.is_member() and (storage.foldername(name))[1]=auth.uid()::text)));
create policy avatar_insert on storage.objects for insert to authenticated with check(bucket_id='avatars' and private.is_member() and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatar_update on storage.objects for update to authenticated using(bucket_id='avatars' and private.is_member() and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='avatars' and private.is_member() and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatar_delete on storage.objects for delete to authenticated using(bucket_id='avatars' and private.is_member() and (storage.foldername(name))[1]=auth.uid()::text);
