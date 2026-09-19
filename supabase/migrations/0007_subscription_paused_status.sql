-- Widen subscriptions.status to allow 'paused', so a super admin can pause a restaurant's
-- subscription (distinct from cancelling it outright) and resume it later. See
-- lib/subscription.ts computeStatus()/isUsable() for how this is enforced at request time.
ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status = ANY (ARRAY['trialing'::text, 'active'::text, 'grace'::text, 'paused'::text, 'expired'::text, 'cancelled'::text]));
