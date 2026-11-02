-- Extend existing tables in place. Preserve user roles, IDs and operational history.
alter table public.events add column if not exists is_emergency boolean not null default false;
alter table public.events add column if not exists change_reason text not null default '';
alter table public.announcements add column if not exists version integer not null default 1 check(version>0);
alter table public.announcements add column if not exists deleted_at timestamptz;
alter table public.announcements add column if not exists priority integer generated always as (
 case kind when 'emergency' then 0 when 'required' then 1 when 'event' then 2 else 3 end
) stored;
alter table public.guest_applications add column if not exists announcement_versions jsonb not null default '{}';
create index if not exists announcements_priority on public.announcements(priority,created_at desc) where deleted_at is null;

create table if not exists public.announcement_versions (
 id uuid primary key default gen_random_uuid(),
 announcement_id uuid not null references public.announcements(id), version integer not null,
 title text not null, content text not null, kind text not null, audience text not null,
 starts_at timestamptz not null, ends_at timestamptz, deleted_at timestamptz,
 created_by uuid references auth.users(id), recorded_by uuid references auth.users(id),
 recorded_at timestamptz not null default now(), unique(announcement_id,version)
);
alter table public.announcement_versions enable row level security;
revoke all on public.announcement_versions from anon,authenticated;
grant select on public.announcement_versions to anon,authenticated;
grant all on public.announcement_versions to service_role;
create policy admin_history on public.announcement_versions for select to authenticated using(private.is_admin());
create policy visible_current_notice on public.announcement_versions for select to anon,authenticated using(
 exists(select 1 from public.announcements a where a.id=announcement_id and a.version=announcement_versions.version and a.deleted_at is null and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now()))
);
insert into public.announcement_versions(announcement_id,version,title,content,kind,audience,starts_at,ends_at,deleted_at,created_by,recorded_at)
select id,version,title,content,kind,audience,starts_at,ends_at,deleted_at,created_by,updated_at from public.announcements
on conflict(announcement_id,version) do nothing;

create or replace function private.prepare_announcement_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  NEW.version:=1; NEW.created_by:=coalesce(auth.uid(),NEW.created_by);
 else
  NEW.created_by:=OLD.created_by;
  if row(NEW.title,NEW.content,NEW.kind,NEW.audience,NEW.starts_at,NEW.ends_at,NEW.deleted_at)
     is distinct from row(OLD.title,OLD.content,OLD.kind,OLD.audience,OLD.starts_at,OLD.ends_at,OLD.deleted_at)
  then NEW.version:=OLD.version+1; else NEW.version:=OLD.version; end if;
 end if;
 NEW.updated_at:=now(); return NEW;
end; $$;
create or replace function private.record_announcement_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.announcement_versions(announcement_id,version,title,content,kind,audience,starts_at,ends_at,deleted_at,created_by,recorded_by)
 values(NEW.id,NEW.version,NEW.title,NEW.content,NEW.kind,NEW.audience,NEW.starts_at,NEW.ends_at,NEW.deleted_at,NEW.created_by,auth.uid())
 on conflict(announcement_id,version) do nothing;
 return NEW;
end; $$;
create or replace function private.protect_announcement_history() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'announcement history is immutable; use soft deletion'; end; $$;
create trigger announcement_revision before insert or update on public.announcements for each row execute function private.prepare_announcement_version();
create trigger announcement_snapshot after insert or update on public.announcements for each row execute function private.record_announcement_version();
create trigger preserve_announcement before delete on public.announcements for each row execute function private.protect_announcement_history();
create trigger immutable_announcement_snapshot before update or delete on public.announcement_versions for each row execute function private.protect_announcement_history();

-- Public/member announcement policies still obey their original audience and publishing window.
drop policy visible_announcements on public.announcements;
create policy visible_announcements on public.announcements for select to anon,authenticated using(
 deleted_at is null and starts_at<=now() and (ends_at is null or ends_at>now())
 and (audience='public' or (audience='member' and private.is_member()))
);

create or replace function private.validate_guest_notice_versions(p_versions jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if p_versions is null or jsonb_typeof(p_versions)<>'object' then raise exception 'notices changed'; end if;
 -- Every currently active public required/emergency notice must have been confirmed.
 if exists(select 1 from public.announcements a where a.deleted_at is null and a.audience='public'
  and a.kind in ('required','emergency') and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
  and p_versions->a.id::text is distinct from to_jsonb(a.version)) then raise exception 'notices changed'; end if;
 -- Optional notices may be recorded too, but only their visible current public version.
 if exists(select 1 from jsonb_each(p_versions) v where not exists(
  select 1 from public.announcements a where a.id::text=v.key and to_jsonb(a.version)=v.value
  and a.deleted_at is null and a.audience='public' and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
 )) then raise exception 'notices changed'; end if;
end; $$;
revoke all on function private.prepare_announcement_version(),private.record_announcement_version(),private.protect_announcement_history(),private.validate_guest_notice_versions(jsonb) from public,anon,authenticated;

-- Preserve the existing guest identity/payment/notification transaction.
create or replace function public.submit_guest(p_data jsonb,p_rate_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare g uuid; a uuid; e public.events; hits integer; rules jsonb;
begin
 delete from private.rate_limits where expires_at<now();
 insert into private.rate_limits(key,expires_at) values(p_rate_key,now()+interval '1 hour')
 on conflict(key) do update set hits=private.rate_limits.hits+1 returning private.rate_limits.hits into hits;
 if hits>8 then raise exception 'rate limit'; end if;
 perform private.validate_guest_notice_versions(coalesce(p_data->'announcement_versions','{}'::jsonb));
 select * into e from public.events where id=(p_data->>'event_id')::uuid and guests_open and status='scheduled' and starts_at>now() and kind<>'holiday';
 if e.id is null then raise exception 'event unavailable'; end if;
 if p_data->>'phone' !~ '^01[016789][0-9]{7,8}$' or length(p_data->>'name') not between 1 and 80 or not coalesce((p_data->>'privacy_consent')::boolean,false) or not coalesce((p_data->>'photo_consent')::boolean,false) or not coalesce((p_data->>'rules_consent')::boolean,false) then raise exception 'invalid application'; end if;
 select coalesce(jsonb_object_agg(r.id::text,r.current_version),'{}') into rules from public.rules r join public.rule_versions v on v.rule_id=r.id and v.version=r.current_version where v.published;
 if rules='{}'::jsonb then raise exception 'rules not configured'; end if;
 if coalesce(p_data->'rule_versions','{}')<>rules then raise exception 'rules changed'; end if;
 insert into public.guests(name,phone,position) values(p_data->>'name',p_data->>'phone',p_data->>'position')
 on conflict(phone) do update set phone=excluded.phone returning id into g;
 -- Existing identity is not renamed by an anonymous caller.
 insert into public.guest_applications(guest_id,event_id,answers,self_reported_paid,rule_versions,announcement_versions)
 values(g,e.id,p_data,coalesce((p_data->>'self_reported_paid')::boolean,false),rules,coalesce(p_data->'announcement_versions','{}'::jsonb)) returning id into a;
 insert into public.guest_payments(application_id,amount) values(a,e.guest_fee);
 return a;
end; $$;

create or replace function public.publish_emergencies() returns void language plpgsql security definer set search_path='' as $$
declare n record; u record;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 for n in select * from public.announcements where deleted_at is null and kind='emergency' and starts_at<=now() and (ends_at is null or ends_at>now()) loop
  for u in select m.user_id from public.members m where m.status='active' and m.user_id is not null and (n.audience<>'admin' or exists(select 1 from public.admins a where a.member_id=m.id)) loop
   perform private.notify(u.user_id,n.title,'긴급공지를 확인해주세요.','/notices',case when n.audience='admin' then 'admin_emergency' else 'emergency' end,'emergency:'||n.id||':'||n.updated_at);
  end loop;
 end loop;
end; $$;

create or replace function public.daily_notifications() returns integer
language plpgsql security definer set search_path='' as $$
declare n record; u record; c integer;
begin
 c:=private.prepare_daily_rosters(now());
 -- Retain existing emergency notices and their audience-specific delivery.
 for n in select * from public.announcements where deleted_at is null and kind='emergency' and starts_at<=now() and (ends_at is null or ends_at>now()) loop
  for u in select m.user_id from public.members m where m.status='active' and m.user_id is not null and (n.audience<>'admin' or exists(select 1 from public.admins a where a.member_id=m.id)) loop
   perform private.notify(u.user_id,n.title,'긴급공지를 확인해주세요.','/notices',case when n.audience='admin' then 'admin_emergency' else 'emergency' end,'emergency:'||n.id||':'||n.updated_at);
  end loop;
 end loop;
 return c;
end;
$$;
