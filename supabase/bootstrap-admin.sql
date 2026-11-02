-- Run manually in Supabase SQL Editor as project owner AFTER the intended admin has logged in.
-- Verify auth.users identity and insert a member first (or import it). Never run against an arbitrary email supplied by a user.
begin;
do $$
declare u uuid; m uuid;
begin
 select id into u from auth.users where email='REPLACE_WITH_VERIFIED_ADMIN_EMAIL';
 if u is null then raise exception 'Verified Google user not found: replace placeholder after login'; end if;
 select id into m from public.members where phone='REPLACE_WITH_VERIFIED_ADMIN_PHONE' for update;
 if m is null then raise exception 'Create/import the verified member record first'; end if;
 if exists(select 1 from public.members where id=m and user_id is not null and user_id<>u) then raise exception 'Member is bound to another identity'; end if;
 update public.members set user_id=u,status='active' where id=m;
 insert into public.admins(member_id,titles) values(m,array['운영진']) on conflict(member_id) do nothing;
end $$;
commit;
