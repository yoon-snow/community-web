-- Run after migration 012 as the project owner. Schedules only regular workouts.
begin;
create extension if not exists pg_cron;
select cron.schedule('spotlight-weekly-workouts','5 15 * * *',
  'set local role service_role; select public.extend_regular_schedule();');
set local role service_role;
select public.extend_regular_schedule() as added_workouts;
commit;
