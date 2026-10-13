-- Multi-branch accounts. A chain has an owner login (chain_members) and linked restaurants (chain_branches).
-- Written only by Super Admin (service role). The chain app reads them through the owner's session.
create table if not exists public.chains (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table if not exists public.chain_members (
  chain_id uuid not null references public.chains(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','manager')),
  created_at timestamptz not null default now(), primary key (chain_id, user_id));
create table if not exists public.chain_branches (
  chain_id uuid not null references public.chains(id) on delete cascade,
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  branch_name text, created_at timestamptz not null default now(), primary key (chain_id, restaurant_id));
alter table public.chains enable row level security;
alter table public.chain_members enable row level security;
alter table public.chain_branches enable row level security;
drop policy if exists "members read own chain" on public.chains;
drop policy if exists "members read own membership" on public.chain_members;
drop policy if exists "members read own branches" on public.chain_branches;
create policy "members read own chain" on public.chains for select using (id in (select chain_id from public.chain_members where user_id = auth.uid()));
create policy "members read own membership" on public.chain_members for select using (user_id = auth.uid());
create policy "members read own branches" on public.chain_branches for select using (chain_id in (select chain_id from public.chain_members where user_id = auth.uid()));
