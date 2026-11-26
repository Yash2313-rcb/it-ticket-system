# Phase 7 - Testing and deployment checklist

These checks have **not** been executed by the author (no database was available while the code was written). Work through them on a staging Supabase project before go-live.

## 1. Database
1. Run migrations `0001` to `0006` in order, then `supabase/seed.sql`.
2. Run `supabase/tests/verify.sql`. Every row it returns should say `ok`.
3. Create the first user in Supabase Auth: it becomes Super Admin.

## 2. Role and permission tests (use one user per role)
| Check | Super Admin | IT Admin | IT Member | Dept Head | Employee |
|---|---|---|---|---|---|
| Open Settings / User Management | yes / yes | yes / no | no | no | no |
| See vendors, bills, budgets, licences | yes | yes | no | no | no |
| See assets list | yes | yes | yes | no (My Assets: department) | no (My Assets: own) |
| Raise ticket | yes | yes | yes | yes | yes |
| See other people's tickets | yes | yes | yes | own department | own only |
| Approve purchase order | yes | no | no | no | no |
| Approve purchase request | yes | yes | no | own department | no |
| Post stock adjustment | yes | yes | no | no | no |
Also try typing restricted URLs directly: they must redirect or show no data.

## 3. Business-logic tests
- **Asset**: register, assign (status becomes Assigned), try assigning twice (must fail), transfer, return, dispose. Check allocation history and the handover/return receipt.
- **QR**: open the asset QR label, scan with a phone, confirm the asset page opens (sign-in required).
- **Inventory**: create an item with opening stock 10, issue 4 (balance 6), try issuing 7 (must fail), adjust -2 as admin (balance 4), try the adjustment as IT Member (must fail). Low-stock alert appears when stock reaches the minimum.
- **Procurement**: request -> approve -> Create PO -> add items -> submit -> approve (Super Admin) -> mark ordered -> receive part -> receive rest. Confirm stock increased or assets were created, and the PO moved to Partially received then Received. Confirm a received PO cannot be edited.
- **GST**: record a bill with subtotal 10,000, discount 1,000, 18% within state. Expect CGST 810, SGST 810, total 10,620. Repeat with other state (IGST 1,620) and exempt.
- **Payments**: pay part of a bill (status Partially paid), try paying more than outstanding (must fail), pay the rest (status Paid, outstanding 0).
- **Budget**: add a budget for a category, add expenses, check actual, remaining and overspend warning.
- **Maintenance**: schedule with a repeat interval, complete it, confirm a service record and the next visit are created.
- **Licences**: allocate all seats, the next allocation must fail.
- **Reports**: open every report, download PDF, Excel and CSV, compare totals with the screens.
- **Alerts**: Notifications > Refresh alerts after setting a warranty/AMC/licence date within 30 days.

## 4. Security
- Confirm RLS is enabled on every table (verify.sql) and the `attachments` bucket is private.
- `SUPABASE_SERVICE_ROLE_KEY` must exist only in server environment variables (never `NEXT_PUBLIC_`).
- Try uploading a .exe (must be rejected) and a file over 10 MB (must be rejected).
- Try opening an attachment URL after the link expires (1 hour).

## 5. Deployment
Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (used inside QR codes) and optionally `CRON_SECRET`. For daily alerts add a Vercel Cron job calling `/api/cron/alerts`, or schedule `select public.generate_alerts()` with pg_cron. Take a Supabase backup before go-live.
