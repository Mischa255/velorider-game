-- Серверное UTC-время для периодических наград спринта.
-- Часы устройства игрока при расчёте интервала не используются.
create or replace function public.get_server_time()
returns timestamptz
language sql
volatile
set search_path = ''
as $$
    select pg_catalog.clock_timestamp();
$$;

grant execute on function public.get_server_time() to anon, authenticated;

notify pgrst, 'reload schema';
