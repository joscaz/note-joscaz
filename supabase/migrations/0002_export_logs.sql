-- Per-user daily MP4-export quota ledger.
-- One row per SUCCESSFUL export. The backend counts a user's rows for the
-- current day (created_at >= today) against DAILY_MP4_EXPORT_LIMIT before
-- encoding, and inserts a row only after a confirmed-successful encode — so a
-- failed or timed-out encode never burns the user's quota. Mirrors the
-- transcription_logs quota model, split into check + record (see the backend's
-- app/export_usage.py).

create table if not exists public.export_logs (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  quality    text,
  created_at timestamptz not null default now()
);

-- The quota query filters by (user_id, created_at) on every export attempt,
-- so index that pair to keep the count cheap as the table grows.
create index if not exists export_logs_user_day_idx
  on public.export_logs (user_id, created_at);

-- Lock the table down: RLS on with no policies means no anon/authenticated
-- access. Only the service role (used by the backend) can read or write it,
-- so the frontend can never forge export usage to inflate its own quota.
alter table public.export_logs enable row level security;
