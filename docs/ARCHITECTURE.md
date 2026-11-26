# Architecture - IT Operations Platform

## 1. Principles
- **Database is the security boundary.** Every table has Supabase Row Level Security. The UI hides what a role cannot use, but RLS decides what is actually readable or writable.
- **Server-side validation.** All writes go through Server Actions with Zod validation. Financial totals (GST, outstanding balance) are computed in the database/server, never trusted from the browser.
- **Audit everything important.** A generic `audit_row()` trigger writes before/after JSON to `activity_logs` for every audited table. Financial and asset tables will use soft status changes instead of hard deletes; DELETE is Super Admin only.
- **Auto IDs from one place.** `next_code(prefix, width)` issues EMP-0001, TSK-000001, TKT-000001, AST-000001, PO-000001, BILL-000001 without gaps from races.
- **One module = one migration.** Each phase adds a numbered SQL file; the dashboard cards switch from "Phase N" to live counts as soon as the table exists.

## 2. Folder structure
```
src/
  app/
    login/                      sign-in page + client form
    (app)/                      authenticated area (layout loads profile, renders shell)
      dashboard/
      organization/{employees,departments,users}/
      settings/
      [...slug]/                status page for modules not built yet
      (later phases add operations/, assets/, inventory/, procurement/, finance/,
       maintenance/, software/, infrastructure/, documents/, reports/)
  components/
    ui/                         button, form fields, card, badge, table, modal, pagination
    layout/                     nav-config (single source for the sidebar), sidebar, app-shell
    dashboard/ organization/    feature components
  lib/
    supabase/                   browser, server, admin (service role), middleware clients
    actions/                    server actions per domain (auth, organization, ...)
    auth.ts permissions.ts      session profile, role helpers
    date-range.ts queries.ts utils.ts
  middleware.ts                 refreshes session, redirects unauthenticated users to /login
supabase/
  migrations/0001_foundation.sql
  seed.sql
docs/ARCHITECTURE.md
```

## 3. Roles
Stored in `roles`; a user's role is `profiles.role`. `role_permissions` maps roles to permission keys (documented matrix, used by later modules via `has_permission()`).

| Role | Key | Summary |
|---|---|---|
| Super Admin | super_admin | Everything, users, settings, approvals |
| IT Administrator | it_admin | Daily operations, assets, procurement, finance, reports |
| IT Team Member | it_member | Assigned tasks/tickets, maintenance records |
| Department Head | dept_head | Raise requests, view department data, approve where authorised |
| Employee | employee | Raise complaints/requests, view own assets |

The first account created in Supabase Auth automatically becomes Super Admin.

## 4. Database relationships (full target schema)
Phase 1 tables exist in `0001_foundation.sql`. Later tables are planned here so foreign keys are consistent.

**Foundation (Phase 1, built):** `roles`, `permissions`, `role_permissions`, `profiles` (-> auth.users, roles, employees), `departments`, `employees` (-> departments), `activity_logs`, `notifications`, `system_settings`, `id_counters`.

**Operations (Phase 2):** `task_categories`, `ticket_categories`, `tasks` (-> departments, employees/profiles, optional ticket, optional asset), `task_comments`, `tickets` (-> employees, departments, profiles as assignee, optional asset), `ticket_comments`.

**Assets & inventory (Phase 3):** `asset_categories`, `assets` (-> asset_categories, vendors, departments, employees), `asset_assignments` (asset <-> employee history), `asset_transfers` (from/to department and employee), `asset_maintenance`, `asset_disposals`, `inventory_items` (-> vendors), `inventory_transactions` (item, type IN/OUT/TRANSFER/ADJUST/DAMAGED/RETURN, employee, department, qty; a trigger maintains `available_qty` and blocks negatives).

**Procurement & finance (Phase 4):** `vendors`, `purchase_requests` + `purchase_request_items`, `purchase_orders` + `purchase_order_items`, `goods_receipts` (creates inventory transactions or assets), `vendor_bills` + `vendor_bill_items` (-> purchase_orders), `vendor_payments` (many per bill; trigger recomputes paid/outstanding/status), `expenses`, `budgets` + `budget_categories`.

**Maintenance & infrastructure (Phase 5):** `amc_contracts`, `warranties`, `maintenance_schedules` (recurrence interval), `software_licenses` + `license_assignments`, `network_devices`, `ip_addresses`, `documents` (Supabase Storage path + category + permissions).

**Key relationships**
```
departments 1--* employees 1--0..1 profiles(user)
employees 1--* asset_assignments *--1 assets *--1 asset_categories
assets 1--* asset_maintenance | amc_contracts | warranties | tickets | tasks
vendors 1--* purchase_orders 1--* purchase_order_items
purchase_orders 1--* goods_receipts --> inventory_transactions / assets
purchase_orders 1--* vendor_bills 1--* vendor_payments
departments 1--* budgets ; expenses --> budget categories
```

## 5. Phase 1 scope (this delivery)
Supabase setup (migration + seed), email/password auth with route protection, five roles with RLS, application shell (full sidebar from the spec, dark mode, responsive), dashboard with live counts and date filters, employee and department CRUD (search, filters, pagination, deactivate instead of delete), user management (create users, change roles, deactivate), settings (organization name) and an audit log view.

## 6. Phase 2 (delivered)
Migration 0002: tasks, tickets, categories, comments, auto IDs (TSK/TKT), RLS (IT staff manage; employees see only own tickets). Screens: daily tasks (filters, time spent, daily/weekly/monthly view), helpdesk (employee portal to raise tickets, assignment, resolution), activity logs, calendar. Dashboard operations cards go live.

## 7. Phases 3-6 (delivered)
- **0003** assets, categories, allocation history, transfers, disposal, maintenance records, vendors, inventory items and transactions. Asset operations (`asset_assign/return/transfer/dispose`) are atomic SQL functions that re-check the caller's role.
- **0004** purchase requests, purchase orders and items (totals computed by trigger), goods receipt (`receive_po_line` updates stock or registers assets in one transaction), vendor bills (GST computed by trigger), payments (trigger keeps paid/outstanding/status correct and blocks overpayment), expenses, budgets.
- **0005** AMC, preventive maintenance with recurrence, software licences and seat allocation, network devices, IP addresses, documents, generalised attachments.
- **0006** `generate_alerts()` with de-duplicated notifications.
- **App**: a config-driven CRUD kit (`src/lib/modules/registry.ts` + `ModulePage` + `FormDialog`) powers vendors, assets, stock items, requests, expenses, AMC, schedules, service records, licences, network devices and IP addresses. Custom pages cover asset detail/QR/receipts, stock transactions, purchase orders, bills, budgets, warranties, documents, reports, notifications and search.
