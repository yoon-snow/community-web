create function public.preview_import(p_entity text,p_rows jsonb,p_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; existing integer:=0; b uuid; found_row boolean; summary jsonb;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if p_entity not in ('members','guests','events','guest_applications','member_applications','membership_payments','event_attendance','uniforms','rules') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>2000 or jsonb_array_length(p_rows)<1 then raise exception 'invalid import'; end if;
 for r in select * from jsonb_array_elements(p_rows) loop
  found_row:=false;
  case p_entity
   when 'members' then select exists(select 1 from public.members where external_id=r->>'external_id' or phone=r->>'phone') into found_row;
   when 'guests' then select exists(select 1 from public.guests where external_id=r->>'external_id' or phone=r->>'phone') into found_row;
   when 'events' then select exists(select 1 from public.events where external_id=r->>'external_id') into found_row;
   when 'guest_applications' then select exists(select 1 from public.guest_applications where external_id=r->>'external_id' or (guest_id=(r->>'guest_id')::uuid and event_id=(r->>'event_id')::uuid)) into found_row;
   when 'member_applications' then select exists(select 1 from public.member_applications where external_id=r->>'external_id') into found_row;
   when 'membership_payments' then select exists(select 1 from public.membership_payments where member_id=(r->>'member_id')::uuid and month=(r->>'month')::date) into found_row;
   when 'event_attendance' then select exists(select 1 from public.event_attendance where member_id=(r->>'member_id')::uuid and event_id=(r->>'event_id')::uuid) into found_row;
   when 'uniforms' then select exists(select 1 from public.uniforms where member_id=(r->>'member_id')::uuid) into found_row;
   when 'rules' then select exists(select 1 from public.rules where category=r->>'category') into found_row;
  end case;
  if found_row then existing:=existing+1; end if;
 end loop;
 summary:=jsonb_build_object('new',jsonb_array_length(p_rows)-existing,'merge',existing,'errors',0);
 insert into public.import_batches(user_id,entity,rows,summary,digest) values(auth.uid(),p_entity,p_rows,summary,p_digest) returning id into b;
 return summary||jsonb_build_object('batch_id',b,'digest',p_digest);
end; $$;
create function public.commit_import(p_batch uuid,p_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.import_batches; r jsonb; a uuid;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 perform pg_advisory_xact_lock(648274);
 select * into b from public.import_batches where id=p_batch and user_id=auth.uid() for update;
 if b.id is null or b.digest<>p_digest then raise exception 'invalid batch'; end if;
 if b.committed_at is not null then return b.summary||'{"already_committed":true}'::jsonb; end if;
 if b.created_at<now()-interval '1 hour' then raise exception 'expired preview'; end if;
 for r in select * from jsonb_array_elements(b.rows) loop
  case b.entity
   when 'members' then
    -- Merge on verified normalized phone; never overwrite auth binding or status of an existing member.
    insert into public.members(external_id,name,phone,birth_date,position,experience,joined_on,status)
    values(r->>'external_id',r->>'name',r->>'phone',nullif(r->>'birth_date','')::date,r->>'position',r->>'experience',(r->>'joined_on')::date,r->>'status')
    on conflict(phone) do update set name=excluded.name,position=excluded.position,experience=excluded.experience,joined_on=least(public.members.joined_on,excluded.joined_on) returning id into a;
    insert into public.member_notes(member_id,admin_memo) values(a,coalesce(r->>'admin_memo','')) on conflict(member_id) do update set admin_memo=case when excluded.admin_memo<>'' then excluded.admin_memo else public.member_notes.admin_memo end;
   when 'guests' then
    insert into public.guests(external_id,name,phone,position) values(r->>'external_id',r->>'name',r->>'phone',r->>'position')
    on conflict(phone) do update set name=excluded.name,position=excluded.position;
   when 'events' then
    insert into public.events(external_id,title,starts_at,ends_at,location,kind,description,guests_open,guest_fee,status)
    values(r->>'external_id',r->>'title',(r->>'starts_at')::timestamptz,(r->>'ends_at')::timestamptz,r->>'location',r->>'kind',coalesce(r->>'description',''),(r->>'guests_open')::boolean,(r->>'guest_fee')::integer,r->>'status')
    on conflict(external_id) do update set title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,location=excluded.location,kind=excluded.kind,description=excluded.description,guests_open=excluded.guests_open,guest_fee=excluded.guest_fee,status=excluded.status;
   when 'guest_applications' then
    insert into public.guest_applications(external_id,guest_id,event_id,answers,self_reported_paid,submitted_at)
    values(r->>'external_id',(r->>'guest_id')::uuid,(r->>'event_id')::uuid,r->'answers',(r->>'self_reported_paid')::boolean,(r->>'submitted_at')::timestamptz)
    on conflict(guest_id,event_id) do update set answers=excluded.answers returning id into a;
    insert into public.guest_payments(application_id,status,amount,verified_by,verified_at) values(a,r->>'payment_status',(r->>'amount')::integer,case when r->>'payment_status'='paid' then auth.uid() end,case when r->>'payment_status'='paid' then now() end)
    on conflict(application_id) do update set status=excluded.status,amount=excluded.amount,verified_by=excluded.verified_by,verified_at=excluded.verified_at;
   when 'member_applications' then
    insert into public.member_applications(external_id,name,phone,answers,submitted_at) values(r->>'external_id',r->>'name',r->>'phone',r->'answers',(r->>'submitted_at')::timestamptz)
    on conflict(external_id) do update set answers=excluded.answers;
   when 'membership_payments' then
    insert into public.membership_payments(external_id,member_id,month,amount,status,verified_by) values(r->>'external_id',(r->>'member_id')::uuid,(r->>'month')::date,(r->>'amount')::integer,r->>'status',auth.uid())
    on conflict(member_id,month) do update set amount=excluded.amount,status=excluded.status,verified_by=auth.uid();
   when 'event_attendance' then
    insert into public.event_attendance(event_id,member_id,response,actual,checked_by) values((r->>'event_id')::uuid,(r->>'member_id')::uuid,r->>'response',(r->>'actual')::boolean,auth.uid())
    on conflict(event_id,member_id) do update set response=excluded.response,actual=excluded.actual,checked_by=auth.uid(),updated_at=now();
   when 'uniforms' then
    insert into public.uniforms(member_id,nickname,number,top_size,bottom_size) values((r->>'member_id')::uuid,r->>'nickname',r->>'number',r->>'top_size',r->>'bottom_size')
    on conflict(member_id) do update set nickname=excluded.nickname,number=excluded.number,top_size=excluded.top_size,bottom_size=excluded.bottom_size;
   when 'rules' then perform public.publish_rule(r->>'category',r->>'title',r->>'content');
  end case;
 end loop;
 update public.import_batches set committed_at=now(),rows='[]'::jsonb where id=b.id;
 insert into public.audit_logs(actor_id,action,entity,entity_id) values(auth.uid(),'IMPORT',b.entity,b.id::text);
 return b.summary;
end; $$;
revoke all on function public.preview_import(text,jsonb,text),public.commit_import(uuid,text) from public,anon;
grant execute on function public.preview_import(text,jsonb,text),public.commit_import(uuid,text) to authenticated;

-- Claim delivery jobs atomically; overlapping cron calls cannot send the same job concurrently.
create function public.claim_push_jobs() returns setof public.push_outbox language sql security definer set search_path='' as $$
 update public.push_outbox set claimed_until=now()+interval '4 minutes',attempts=attempts+1
 where id in(select id from public.push_outbox where delivered_at is null and attempts<5 and (claimed_until is null or claimed_until<now()) order by created_at for update skip locked limit 40)
 returning *; $$;
revoke all on function public.claim_push_jobs() from public,anon,authenticated;
grant execute on function public.claim_push_jobs() to service_role;
