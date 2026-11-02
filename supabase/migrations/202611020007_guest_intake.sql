-- Additive intake metadata. Existing applications and their UUIDs remain intact.
alter table public.form_questions
 add column is_system boolean not null default false,
 add column field_key text,
 add column help_text text not null default '',
 add column version integer not null default 1 check(version>0),
 add column updated_at timestamptz not null default now(),
 add column deleted_at timestamptz;
create unique index guest_system_fields on public.form_questions(form,field_key) where is_system;
insert into public.form_questions(form,key,field_key,label,type,required,sort_order,is_system)
select 'guest','base_'||field,field,label,'text',required,ord,true from (values
 ('name','이름',true,0),('birth_date','생년월일',true,1),('gender','성별',true,2),
 ('phone','연락처',true,3),('position','희망 포지션',true,4),('experience','배구 경력',true,5),
 ('source','SpotLight를 알게 된 경로',false,6),('notes','기타 확인사항 및 질문',false,7),
 ('event_id','참여할 운동',true,8),('notice_consent','공지사항을 확인했습니다. (필수)',true,9),
 ('rules_consent','게스트 참가 규정·회칙을 확인하고 동의합니다. (필수)',true,10),
 ('photo_consent','활동 사진·영상이 동호회 기록 및 홍보에 활용되는 안내를 확인하고 동의합니다. (필수)',true,11),
 ('privacy_consent','개인정보 수집·이용에 동의합니다. (필수)',true,12),
 ('self_reported_paid','입금을 완료하셨나요?',true,13),
 ('fee_acknowledgement','운영진의 실제 입금 확인 후 확정됨을 이해했습니다.',true,14)
) as q(field,label,required,ord) on conflict(form,key) do nothing;

create function private.version_form_question() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'archive questions instead of deleting'; end if;
 if old.is_system and (not new.active or new.deleted_at is not null or
  (new.form,new.key,new.field_key,new.is_system,new.type,new.required,new.options)
  is distinct from (old.form,old.key,old.field_key,old.is_system,old.type,old.required,old.options)) then
  raise exception 'basic question structure is protected';
 end if;
 if not old.is_system and (new.form,new.key,new.field_key,new.is_system) is distinct from (old.form,old.key,old.field_key,old.is_system) then
  raise exception 'question identity is immutable';
 end if;
 if new.deleted_at is not null then new.active:=false; end if;
 new.version:=old.version;
 if (new.label,new.type,new.options,new.required,new.active,new.help_text,new.deleted_at)
  is distinct from (old.label,old.type,old.options,old.required,old.active,old.help_text,old.deleted_at) then
  new.version:=old.version+1;
 end if;
 new.updated_at:=now();
 return new;
end; $$;
create trigger version_form_question before update or delete on public.form_questions for each row execute function private.version_form_question();
-- Only the service role seeds basic fields; admins add ordinary custom questions.
drop policy admin_write on public.form_questions;
create policy admin_insert_question on public.form_questions for insert to authenticated with check(private.is_admin() and not is_system and field_key is null and deleted_at is null and version=1);
create policy admin_update_question on public.form_questions for update to authenticated using(private.is_admin()) with check(private.is_admin());
revoke delete on public.form_questions from authenticated;
drop policy public_questions on public.form_questions;
create policy public_questions on public.form_questions for select to anon,authenticated using(active and deleted_at is null);

alter table public.guest_applications
 add column question_snapshot jsonb not null default '[]',
 add column actual_attended boolean,
 add column attendance_checked_at timestamptz,
 add column attendance_checked_by uuid references auth.users(id);
create index guest_visit_history on public.guest_applications(guest_id,submitted_at desc);

create function private.snapshot_guest_questions() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.form_questions; versions jsonb; snapshot jsonb:='[]'; answer jsonb;
begin
 -- Legacy imports and existing service-role integrations do not claim a questionnaire version.
 -- Web intake always supplies versions; compare the complete set, including new required questions.
 perform 1 from public.form_questions where form='guest' and active and deleted_at is null order by id for share;
 select coalesce(jsonb_object_agg(id::text,version),'{}') into versions from public.form_questions where form='guest' and active and deleted_at is null;
 if new.answers ? 'question_versions' and new.answers->'question_versions' is distinct from versions then raise exception 'questions changed'; end if;
 for q in select * from public.form_questions where form='guest' and active and deleted_at is null order by sort_order,id loop
  answer:=case when q.is_system then new.answers->q.field_key else new.answers->'extra_answers'->q.key end;
  if new.answers ? 'question_versions' and not q.is_system then
   if q.required and (answer is null or jsonb_typeof(answer)<>'string' or trim(answer#>>'{}')='') then raise exception 'required question unanswered'; end if;
   if answer is not null and answer<>'""'::jsonb and (jsonb_typeof(answer)<>'string' or length(answer#>>'{}')>2000 or (q.type='select' and not q.options @> jsonb_build_array(answer))) then raise exception 'invalid question answer'; end if;
  end if;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('id',q.id,'key',q.key,'field_key',q.field_key,'label',q.label,'type',q.type,'options',q.options,'required',q.required,'help_text',q.help_text,'version',q.version));
 end loop;
 new.question_snapshot:=snapshot;
 return new;
end; $$;
create trigger snapshot_guest_questions before insert on public.guest_applications for each row execute function private.snapshot_guest_questions();

-- Return only this submission, inside the existing atomic identity/application/payment transaction.
-- This is not an anonymous receipt lookup and never returns an existing guest's identity/history.
create function public.submit_guest_receipt(p_data jsonb,p_rate_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid; result jsonb;
begin
 if p_data->>'notice_consent' is distinct from 'true' or p_data->>'fee_acknowledgement' is distinct from 'true' or not(p_data ? 'question_versions') then raise exception 'invalid application'; end if;
 a:=public.submit_guest(p_data,p_rate_key);
 select jsonb_build_object('receipt',g.id,'event',jsonb_build_object('id',e.id,'title',e.title,'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location),
 'payment',jsonb_build_object('status',p.status,'amount',p.amount),'self_reported_paid',g.self_reported_paid)
 into result from public.guest_applications g join public.events e on e.id=g.event_id join public.guest_payments p on p.application_id=g.id where g.id=a;
 return result;
end; $$;
revoke all on function public.submit_guest_receipt(jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_guest_receipt(jsonb,text) to service_role;

create or replace function public.confirm_guest_payment(p_application uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if not exists(select 1 from public.guest_payments where application_id=p_application) then raise exception 'not found'; end if;
 update public.guest_payments set status='paid',verified_by=auth.uid(),verified_at=now() where application_id=p_application and status='pending';
end; $$;

create function public.check_guest_attendance(p_application uuid,p_actual boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 if p_actual is null then raise exception 'invalid attendance'; end if;
 if not exists(select 1 from public.guest_applications a join public.events e on e.id=a.event_id join public.guest_payments p on p.application_id=a.id
  where a.id=p_application and p.status='paid' and e.ends_at<=now() and e.status in ('scheduled','completed')) then raise exception 'past paid event required'; end if;
 update public.guest_applications set actual_attended=p_actual,attendance_checked_at=now(),attendance_checked_by=auth.uid() where id=p_application;
end; $$;
create function public.admin_guest_history(p_guest uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_admin() then raise exception 'forbidden'; end if;
 select jsonb_build_object('guest_id',p_guest,'applications',count(*),'total_visits',count(*) filter(where a.actual_attended=true and e.status in ('scheduled','completed') and e.ends_at<=now()),
  'last_visited_at',max(e.starts_at) filter(where a.actual_attended=true and e.status in ('scheduled','completed') and e.ends_at<=now()),
  'recent',coalesce((select jsonb_agg(row_to_json(x)) from (
   select g.id,g.actual_attended,g.submitted_at,ev.starts_at,ev.title,p.status as payment_status
   from public.guest_applications g join public.events ev on ev.id=g.event_id join public.guest_payments p on p.application_id=g.id
   where g.guest_id=p_guest order by ev.starts_at desc limit 20) x),'[]')) into result
 from public.guest_applications a join public.events e on e.id=a.event_id where a.guest_id=p_guest;
 return result;
end; $$;
revoke all on function public.check_guest_attendance(uuid,boolean),public.admin_guest_history(uuid) from public,anon;
grant execute on function public.check_guest_attendance(uuid,boolean),public.admin_guest_history(uuid) to authenticated;
revoke all on function private.version_form_question(),private.snapshot_guest_questions() from public,anon,authenticated;
