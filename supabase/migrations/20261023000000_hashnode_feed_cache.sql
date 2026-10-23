create table if not exists public.hashnode_feed_cache (
  id text primary key check (id = 'hashnode-feed'),
  payload jsonb not null,
  fetched_at timestamptz not null
);

alter table public.hashnode_feed_cache enable row level security;

revoke all on public.hashnode_feed_cache from anon, authenticated;
grant all on public.hashnode_feed_cache to service_role;

create policy "Service role manages the Hashnode feed cache"
  on public.hashnode_feed_cache
  for all
  to service_role
  using (true)
  with check (true);
