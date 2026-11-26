# IT Department Management and Operations Platform (Phases 1-6 combined)

Next.js 15 (App Router) + TypeScript + Tailwind + Supabase (Postgres, Auth, RLS).
Phases 3-6 add assets with QR codes and allocation history, inventory with stock transactions, procurement (requests, purchase orders, goods receipt), vendors, GST bills and payments, expenses, budgets, AMC and warranty tracking, preventive maintenance, software licences, network infrastructure, documents, 36 downloadable reports, notifications and global search.
Phase 2 adds daily tasks, helpdesk tickets (with an employee portal), comments, file attachments, activity logs, a calendar and CSV export.
Phase 1 delivers: authentication, 5 roles with RLS, app shell and navigation, live dashboard, employees, departments, user management, settings and audit log.
Later modules appear in the sidebar with a "Phase N" status page until they are built. See `docs/ARCHITECTURE.md`.

## Setup

1. **Create a Supabase project** (supabase.com).
2. **Run the database setup** in the Supabase SQL editor, in order:
   1. `supabase/migrations/0001_foundation.sql`
   2. `supabase/migrations/0002_operations.sql` (Phase 2: tasks, tickets, attachments bucket)
   3. `supabase/migrations/0003_assets_inventory.sql`, `0004_procurement_finance.sql`, `0005_maintenance_infrastructure.sql`, `0006_alerts.sql`
   4. `supabase/seed.sql` (optional starter departments), then `supabase/tests/verify.sql` (every row should say ok)
3. **Create the first user**: Supabase dashboard > Authentication > Users > Add user (tick "Auto Confirm User").
   The first user is automatically made **Super Admin**. Create everyone else from the app (Organization > User Management).
4. **Environment**: copy `.env.example` to `.env.local` and fill in the URL, anon key and service-role key
   (Project Settings > API). The service-role key is used only in server actions for creating users - never expose it.
5. **Install and run**
   ```bash
   npm install
   npm run dev      # http://localhost:3000
   ```
6. **Deploy**: push to Git and import in Vercel, add the same three env vars. Or `npm run build && npm start` on your own server.

## Checks before you rely on it
- Sign in as Super Admin, add a department and an employee (leave Employee ID blank - EMP-0001 is generated).
- Create a user with role Employee, sign in as them: they must not see Employees, User Management or Settings, and direct URLs redirect to the dashboard.
- Open Settings > Audit log: your changes should be listed.

## Notes
- Employees are deactivated, not deleted, so history stays intact. Hard deletes are Super Admin only at the database level.
- Role checks exist in the UI for convenience, but RLS in the database is what enforces access.

## Phase 2 notes
- **Run `0002_operations.sql` before deploying**, otherwise the new pages show errors. It also creates a private Storage bucket named `attachments`.
- **Employees raise tickets** from Helpdesk Tickets. To let an Employee or Department Head see their own tickets by employee record, link their user to an employee in User Management.
- **Ticket response targets** are set from priority: Critical 4 h, High 8 h, Medium 24 h, Low 72 h. A ticket past its target while still open is shown as Overdue. Edit the intervals in `tickets_before()` in the migration.
- **IT Team Members** see and edit only tasks they performed, assigned or created. IT Administrators see everything.
- Day boundaries on activity logs and the calendar use India time (+05:30). Change `TZ_OFFSET` in `src/lib/ops.ts` if needed.
- Attachments: PDF, images, Office files, CSV, TXT, ZIP, up to 10 MB. Files are private and opened through short-lived links.

## Phases 3-6 notes
- **Run migrations 0003 to 0006 before deploying.** Pages for a module show a clear message until its migration is applied.
- Set `NEXT_PUBLIC_SITE_URL` (for example `https://your-app.vercel.app`) so QR codes contain the correct address.
- **Alerts**: Notifications > Refresh alerts (administrators) creates warranty, AMC, licence, maintenance, overdue task, payment and budget alerts. For automatic daily alerts, add a Vercel Cron job for `/api/cron/alerts` with a `CRON_SECRET` environment variable, or use pg_cron (see `0006_alerts.sql`).
- **Deviations from the original brief** (kept simple on purpose): a purchase request holds one item (no separate request-items table); warranties are read from asset warranty dates (no separate warranties table); payment proofs are attached to the bill; reports show the organization name but no logo image; email notifications are not included (listed as optional in the brief).
- This is an internal IT purchase and expense tracker, not a statutory accounting or GST filing system.
- See `docs/TESTING.md` for the Phase 7 test checklist. It has not been executed yet.

## Setting up for a single IT person (embroidery / handicraft business)
1. Run `supabase/seed_handicraft.sql` after the migrations. It adds departments (Embroidery Unit, Stitching, Design Studio, Showroom, Dispatch and so on), extra asset categories (POS terminals, barcode printers, embroidery machine PCs) and extra ticket and task categories.
2. Use your **Super Admin** account for everything. You can approve your own purchase orders, so there is no waiting on a second person.
3. Create **Employee** logins only for staff who need to raise tickets (store counter, embroidery supervisor). Link each login to an employee record so they see only their own tickets and assets.
4. Start with the modules you will use daily: Helpdesk Tickets, Daily Tasks, Assets, Software and Licenses, Vendors and Bills. Leave the others until you need them.
