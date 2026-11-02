-- ferrokey database. Paste into the Supabase SQL Editor once and run.
-- Only the server (service-role key) touches these tables: RLS is on with no
-- policies, so the public anon key can read or write nothing.

-- Locked messages. The server can't read them: blob is HPKE ciphertext.
create table if not exists drops (
  id text primary key check (id ~ '^[a-km-np-z2-9]{26}$'),
  blob text not null check (length(blob) <= 87382),        -- 64 KB as base64url
  delete_hash text not null check (length(delete_hash) = 43),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists drops_expires_at on drops (expires_at);

-- Signed public profiles, keyed by the 128-bit fingerprint id.
create table if not exists profiles (
  id text primary key check (id ~ '^[a-km-np-z2-9]{26}$'),
  record jsonb not null,
  updated_at bigint not null
);

-- Hourly counters per salted IP hash.
create table if not exists rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

alter table drops enable row level security;
alter table profiles enable row level security;
alter table rate_limits enable row level security;

-- Save a profile only if it's newer than the stored one (stops replays of old versions).
create or replace function put_profile(p_id text, p_record jsonb, p_updated_at bigint)
returns boolean language sql security invoker as $$
  with up as (
    insert into profiles (id, record, updated_at) values (p_id, p_record, p_updated_at)
    on conflict (id) do update set record = excluded.record, updated_at = excluded.updated_at
      where profiles.updated_at < excluded.updated_at
    returning 1
  )
  select exists (select 1 from up);
$$;

-- Add one to a rate-limit counter and return the new count (atomic).
create or replace function hit_rate(p_key text, p_window timestamptz)
returns int language sql security invoker as $$
  insert into rate_limits (key, window_start, count) values (p_key, p_window, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count;
$$;

revoke all on function put_profile(text, jsonb, bigint) from public, anon, authenticated;
revoke all on function hit_rate(text, timestamptz) from public, anon, authenticated;

-- Hourly cleanup: expired drops and old counters. Reads also ignore expired drops,
-- so this only frees space.
create extension if not exists pg_cron;
select cron.schedule('ferrokey-cleanup', '17 * * * *', $$
  delete from drops where expires_at < now();
  delete from rate_limits where window_start < now() - interval '1 day';
$$);
