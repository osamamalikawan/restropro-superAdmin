-- Payments a restaurant makes to the platform for its subscription. Deliberately has no
-- cascade from restaurant data and is never touched by admin_reset_restaurant_data(), so billing
-- history survives any reset.
create table if not exists public.tenant_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'cash',
  reference text,
  note text,
  plan_id uuid references public.subscription_plans(id),
  billing_cycle text,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz not null default now(),
  recorded_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists ix_tenant_payments_restaurant on public.tenant_payments (restaurant_id, paid_at desc);
alter table public.tenant_payments enable row level security;
-- service-role only (Super Admin); tenants never read or write this table directly.
