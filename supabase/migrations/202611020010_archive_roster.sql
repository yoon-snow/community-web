-- Preserve existing videos/playlists and IDs; make the archive member-only even for legacy public flags.
drop policy visible_videos on public.videos;
drop policy visible_playlists on public.video_playlists;
create policy visible_videos on public.videos for select to authenticated using(private.is_member());
create policy visible_playlists on public.video_playlists for select to authenticated using(private.is_member());

alter table public.videos
 add column video_count integer check(video_count>=0),
 add column cover_video_id text check(cover_video_id ~ '^[A-Za-z0-9_-]{11}$');
alter table public.video_playlists
 add column filmed_on date,
 add column kind text not null default 'game' check(kind in ('game','lesson','match','practice','event')),
 add column event_id uuid references public.events(id),
 add column video_count integer check(video_count>=0),
 add column cover_video_id text check(cover_video_id ~ '^[A-Za-z0-9_-]{11}$'),
 add column thumbnail text,
 add column created_by uuid references auth.users(id);
create trigger audit_change after insert or update or delete on public.video_playlists for each row execute function private.audit();

-- security_invoker retains the caller's RLS on both original tables.
create view public.video_archive with(security_invoker=true) as
 select v.id,v.title,v.description,v.url,v.video_id,v.playlist_id,v.thumbnail,v.filmed_on,v.kind,v.event_id,v.visibility,v.created_at,
  v.video_count,v.cover_video_id,'videos'::text as source,
  case when v.video_id is null then 'playlist' else 'video' end as entry_type,'filmed'::text as date_source
 from public.videos v
 union all
 select p.id,p.title,p.description,p.url,null::text,p.playlist_id,p.thumbnail,
  coalesce(p.filmed_on,(p.created_at at time zone 'Asia/Seoul')::date),p.kind,p.event_id,p.visibility,p.created_at,
  p.video_count,p.cover_video_id,'playlists'::text,'playlist'::text,
  case when p.filmed_on is null then 'registered' else 'filmed' end
 from public.video_playlists p;
revoke all on public.video_archive from public,anon;
grant select on public.video_archive to authenticated,service_role;
create index videos_archive_order on public.videos(filmed_on desc,created_at desc);
create index playlists_archive_event on public.video_playlists(event_id);

create function public.admin_roster(p_event uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e jsonb; m jsonb; g jsonb;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 select jsonb_build_object('id',id,'title',title,'starts_at',starts_at,'ends_at',ends_at,'kind',kind,'location',location) into e
 from public.events where id=p_event and status in ('scheduled','completed') and kind<>'holiday';
 if e is null then raise exception 'event unavailable'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('name',x.name,'position',x.position) order by x.position,x.name,x.id),'[]') into m
 from public.event_attendance a join public.members x on x.id=a.member_id
 where a.event_id=p_event and a.response='yes' and x.status='active';
 select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(nullif(a.answers->>'name',''),x.name),
  'position',coalesce(nullif(a.answers->>'position',''),x.position)) order by a.submitted_at,a.id),'[]') into g
 from public.guest_applications a join public.guests x on x.id=a.guest_id join public.guest_payments p on p.application_id=a.id
 where a.event_id=p_event and p.status='paid';
 return jsonb_build_object('event',e,'members',m,'guests',g,'counts',jsonb_build_object('members',jsonb_array_length(m),'guests',jsonb_array_length(g),'total',jsonb_array_length(m)+jsonb_array_length(g)));
end; $$;
revoke all on function public.admin_roster(uuid) from public,anon;
grant execute on function public.admin_roster(uuid) to authenticated;
