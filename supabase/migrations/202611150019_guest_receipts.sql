begin;
-- Sequential IDs are assigned atomically, including simultaneous applications.
-- Lookup also requires the phone supplied at submission, and is rate limited.
alter table public.guest_applications add column receipt_number integer
  generated always as identity (start with 10000000 maxvalue 99999999 no cycle) unique;
create or replace function public.submit_guest_receipt(p_data jsonb,p_rate_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid; result jsonb;
begin
 if not exists (select 1 from public.events where id=(p_data->>'event_id')::uuid
   and (starts_at at time zone 'Asia/Seoul')::date <= (now() at time zone 'Asia/Seoul')::date + 14 for share)
 then raise exception '신청은 오늘부터 2주 이내 운동만 가능합니다.'; end if;
 if p_data->>'notice_consent' is distinct from 'true' or p_data->>'fee_acknowledgement' is distinct from 'true' or not(p_data ? 'question_versions') then raise exception 'invalid application'; end if;
 a:=public.submit_guest(p_data,p_rate_key);
 select jsonb_build_object('receipt',g.id,'receipt_number',g.receipt_number::text,
 'event',jsonb_build_object('id',e.id,'title',e.title,'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location),
 'payment',jsonb_build_object('status',p.status,'amount',p.amount),'self_reported_paid',g.self_reported_paid)
 into result from public.guest_applications g join public.events e on e.id=g.event_id join public.guest_payments p on p.application_id=g.id where g.id=a;
 return result;
end; $$;
commit;
