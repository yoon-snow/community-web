begin;
alter table public.post_comments add column parent_id uuid,
  add constraint post_comments_post_identity unique(post_id,id),
  add constraint post_comments_reply_parent foreign key(post_id,parent_id)
    references public.post_comments(post_id,id) on delete set null (parent_id),
  add constraint post_comments_not_self check(parent_id is distinct from id);
create index post_comments_replies on public.post_comments(post_id,parent_id,created_at,id);
create function private.check_reply_parent() returns trigger language plpgsql set search_path='' as $$
begin
 if new.parent_id is not null and not exists(select from public.post_comments p where p.id=new.parent_id and p.post_id=new.post_id and p.parent_id is null)
 then raise exception 'invalid reply parent'; end if;
 return new;
end; $$;
create trigger check_reply_parent before insert on public.post_comments for each row execute function private.check_reply_parent();
grant insert(parent_id) on public.post_comments to authenticated;
commit;
