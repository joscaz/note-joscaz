-- Per-IP rate limiting for the get-curated-midi edge function.
-- A fixed-window counter stored in Postgres, because the edge function is
-- stateless and runs across many distributed instances — an in-memory counter
-- would be trivially bypassed by hitting different instances.

create table if not exists public.curated_rate_limit (
  ip           text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (ip, window_start)
);

create index if not exists curated_rate_limit_window_idx
  on public.curated_rate_limit (window_start);

-- Lock the table down: RLS on with no policies means no anon/authenticated
-- access. Only the service role (used by the edge function) can touch it.
alter table public.curated_rate_limit enable row level security;

-- Atomically increments the counter for an IP in the current fixed window and
-- returns whether the request is still within the limit.
--   returns true  = allowed
--   returns false = over the limit
-- The limit and window are PARAMETERS, not hardcoded — the edge function owns
-- the actual numbers, so they can change without touching this function.
create or replace function public.check_rate_limit(
  p_ip             text,
  p_limit          integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count        integer;
begin
  -- Bucket "now" into a fixed window of p_window_seconds.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.curated_rate_limit as r (ip, window_start, count)
  values (p_ip, v_window_start, 1)
  on conflict (ip, window_start)
    do update set count = r.count + 1
  returning r.count into v_count;

  -- Opportunistic cleanup (~1% of calls) so the table never grows unbounded.
  if random() < 0.01 then
    delete from public.curated_rate_limit
    where window_start < now() - interval '1 hour';
  end if;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer)
  to service_role;
