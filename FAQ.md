# Refund Swatter Lite – Frequently Asked Questions

## Does this project support local Supabase Docker development?
Not yet. All testing has been done against cloud Supabase projects only. The setup script intentionally targets the hosted environment via `supabase link` + `--use-api`, so local Docker containers started with `supabase start` are currently unsupported.

## Can I skip enabling the cron job?
Absolutely. The setup script prints optional instructions for scheduling the `process-notifications-cron` function, but real-time notification handling continues to work without it. The cron job is only needed if you want an automated retry every few minutes—otherwise leave `SETUP_CRON=false` in `.env.project` and skip the cron configuration step.

## Why are the Edge Functions configured with `verify_jwt = false`?
Because each function performs its own authentication. Shared helpers such as `verifyAuth` let us support service-role calls, admin-only checks, and cron fallbacks in one place. Supabase itself recommends disabling the legacy `verify_jwt` gate—the "Verify JWT with legacy secret" option only checks signatures against the easily obtained anon key—so we keep it OFF and rely on the stricter, custom authorization inside every handler.

## Can I host this somewhere other than Supabase Cloud?
Not right now. The project depends on Supabase-managed services such as Vault, pg_cron, and the CLI-only remote deployment flow (`supabase functions deploy --use-api`). Self-hosted Postgres or generic cloud databases are unsupported. You can, however, deploy to any Supabase Cloud organization/region as long as you supply that project’s reference ID.

## Are all tables protected with Row Level Security (RLS)?
Yes. The baseline migration enables RLS on every table in the `public` schema and ships policies that restrict access to authenticated admin users. To extend or tighten the rules, create new migrations that add policies — never disable RLS.

## Can I register multiple bundle IDs?
This starter is single-tenant by design. The `config` table stores one set of Apple credentials, so only a single bundle ID is supported at a time. If you need to serve multiple apps, provision separate Supabase projects (or fork the repo and extend the schema to be multi-tenant).
