begin;
create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.announcements(id) on delete cascade,
  author_id uuid default auth.uid() references auth.users(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 1500),
  created_at timestamptz not null default now()
);
create index post_comments_thread on public.post_comments(post_id,created_at,id);
alter table public.post_comments enable row level security;
revoke all on public.post_comments from public, anon, authenticated;
grant select, delete on public.post_comments to authenticated;
grant insert(post_id,body), update(body) on public.post_comments to authenticated;
create policy read_post_comments on public.post_comments for select to authenticated using (
 private.is_member() and exists(select 1 from public.announcements a where a.id=post_id and a.deleted_at is null)
);
create policy add_post_comment on public.post_comments for insert to authenticated with check (
 author_id=auth.uid() and private.is_member() and exists(select 1 from public.announcements a where a.id=post_id and a.deleted_at is null)
);
create policy edit_post_comment on public.post_comments for update to authenticated using (
 author_id=auth.uid() and private.is_member() and exists(select 1 from public.announcements a where a.id=post_id and a.deleted_at is null)
) with check (author_id=auth.uid());
create policy remove_post_comment on public.post_comments for delete to authenticated using (
 private.is_member() and (author_id=auth.uid() or private.is_admin()) and exists(select 1 from public.announcements a where a.id=post_id)
);
alter table public.inquiry_messages drop constraint inquiry_messages_sender_check;
alter table public.inquiry_messages add constraint inquiry_messages_sender_check check(sender in ('guest','member','admin','bot'));
create function public.inquiry_faq_reply(p_ticket uuid,p_faq uuid) returns void language plpgsql set search_path='' as $$
declare answer_text text;
begin
 select f.answer into strict answer_text from public.faqs f join public.faq_categories c on c.id=f.category_id
 where f.id=p_faq and f.is_active and c.is_active;
 insert into public.inquiry_messages(inquiry_id,sender,body) values(p_ticket,'bot',answer_text);
 update public.inquiries set updated_at=now() where id=p_ticket;
end; $$;
revoke all on function public.inquiry_faq_reply(uuid,uuid) from public,anon,authenticated;
grant execute on function public.inquiry_faq_reply(uuid,uuid) to service_role;
commit;
