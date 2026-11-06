-- Guests can obtain only the version identifiers needed to submit the existing intake form.
drop policy public_rules on public.rules;
drop policy public_rule_versions on public.rule_versions;
create policy member_rules on public.rules for select to authenticated using(private.is_member());
create policy member_rule_versions on public.rule_versions for select to authenticated using(private.is_member() and published);
create function public.intake_rule_versions() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(r.id::text,r.current_version),'{}') from public.rules r
 join public.rule_versions v on v.rule_id=r.id and v.version=r.current_version and v.published;
$$;
revoke all on function public.intake_rule_versions() from public;
grant execute on function public.intake_rule_versions() to anon,authenticated;

create function public.admin_daily_guests() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare today date := (now() at time zone 'Asia/Seoul')::date; result jsonb;
begin
 if not private.is_admin() then raise exception 'admin required' using errcode='42501'; end if;
 with days as (
 select today as day union all
 select (select (starts_at at time zone 'Asia/Seoul')::date from public.events where
 starts_at >= ((today+1)::timestamp at time zone 'Asia/Seoul') and status in ('scheduled','completed') and kind<>'holiday' order by starts_at limit 1)
 )
 select jsonb_agg(jsonb_build_object('day',d.day,'events',coalesce((
 select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'starts_at',e.starts_at,'applications',coalesce((
 select jsonb_agg(jsonb_build_object('id',a.id,'name',coalesce(a.answers->>'name',g.name),'birth_date',a.answers->>'birth_date',
 'position',coalesce(a.answers->>'position',g.position),'experience',a.answers->>'experience','payment',p.status)
 order by a.submitted_at,a.id) from public.guest_applications a join public.guests g on g.id=a.guest_id
 left join public.guest_payments p on p.application_id=a.id where a.event_id=e.id),'[]'::jsonb)) order by e.starts_at,e.id)
 from public.events e where e.starts_at >= (d.day::timestamp at time zone 'Asia/Seoul') and e.starts_at < ((d.day+1)::timestamp at time zone 'Asia/Seoul')
 and e.status in ('scheduled','completed') and e.kind<>'holiday'),'[]'::jsonb)) order by d.day nulls last) into result from days d;
 return result;
end $$;
revoke all on function public.admin_daily_guests() from public,anon;
grant execute on function public.admin_daily_guests() to authenticated;
