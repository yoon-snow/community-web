-- Keep profile+private-note edits atomic.
create function public.admin_update_member(p_id uuid,p_profile jsonb,p_memo text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if p_id=private.my_member_id() and p_profile->>'status'<>'active' then raise exception 'cannot disable self'; end if;
 if p_profile->>'phone' !~ '^01[016789][0-9]{7,8}$' or length(p_profile->>'name') not between 1 and 80 then raise exception 'invalid profile'; end if;
 update public.members set name=p_profile->>'name',phone=p_profile->>'phone',birth_date=nullif(p_profile->>'birth_date','')::date,position=p_profile->>'position',experience=p_profile->>'experience',status=p_profile->>'status' where id=p_id;
 if not found then raise exception 'member not found'; end if;
 insert into public.member_notes(member_id,admin_memo) values(p_id,p_memo) on conflict(member_id) do update set admin_memo=excluded.admin_memo;
end; $$;
create function public.admin_set_avatar(p_member uuid,p_path text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if p_path is not null and p_path not like 'managed/'||p_member::text||'/%' then raise exception 'invalid avatar path'; end if;
 update public.members set avatar_path=p_path where id=p_member;
 if not found then raise exception 'member not found'; end if;
end; $$;
revoke all on function public.admin_update_member(uuid,jsonb,text),public.admin_set_avatar(uuid,text) from public,anon;
grant execute on function public.admin_update_member(uuid,jsonb,text),public.admin_set_avatar(uuid,text) to authenticated;
-- Admin-managed avatars are separate from user uploads.
create policy avatar_admin_insert on storage.objects for insert to authenticated with check(bucket_id='avatars' and private.is_admin() and (storage.foldername(name))[1]='managed');
create policy avatar_admin_delete on storage.objects for delete to authenticated using(bucket_id='avatars' and private.is_admin());

create policy avatar_managed_owner_read on storage.objects for select to authenticated using(bucket_id='avatars' and private.is_member() and name like 'managed/'||private.my_member_id()::text||'/%');
create policy avatar_managed_owner_delete on storage.objects for delete to authenticated using(bucket_id='avatars' and private.is_member() and name like 'managed/'||private.my_member_id()::text||'/%');
