# Performance notes (migration 0007)

## What was slow
| Cause | Fix |
|---|---|
| Dashboard ran ~35 queries and downloaded up to 20,000 rows per table, then added them up in JavaScript | One database function, `dashboard_stats()`, returns every number in a single call |
| Search used `ilike '%text%'`, which cannot use normal indexes (full table scan) | Trigram (GIN) indexes on every searched column |
| About 45 foreign-key columns had no index (joins, filters, deletes scanned whole tables) | Indexes added for each |
| Each page checked the login with Supabase twice before loading anything | The page now reads the already-verified session; one check (in middleware) remains |
| Profile and notification count were fetched one after another | Fetched together |
| Blank screen while a page loaded | Loading skeleton appears instantly (`src/app/(app)/loading.tsx`) |

## Do this once
1. Run `supabase/migrations/0007_performance.sql` in the Supabase SQL editor (safe to repeat).
2. **Match the Vercel region to your Supabase region.** This is often the biggest single factor: every page makes several database calls, and each one pays the distance between the two. In Supabase see Project Settings > Infrastructure for your region (for example Mumbai, ap-south-1). In Vercel go to Project > Settings > Functions > Function Region and choose the nearest one (Mumbai is `bom1`). Redeploy afterwards.
3. Keep the free Supabase project awake: free projects pause after inactivity and the first request after a pause takes several seconds.

## If a page is still slow
Supabase dashboard > Reports > Query performance shows the slowest queries. Pages that still read many rows: Budgets (reads a year of expenses) and Reports. They are fine up to a few thousand rows; tell me if they slow down and I will move them into database functions the same way.
