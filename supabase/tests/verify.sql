-- Run in the Supabase SQL editor after all migrations. Every row should show 'ok'.
select 'RLS enabled: ' || c.relname as check_name,
       case when c.relrowsecurity then 'ok' else 'MISSING RLS' end as result
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

select 'Trigger exists: ' || t as check_name,
       case when exists (select 1 from pg_trigger where tgname = t and not tgisinternal) then 'ok' else 'MISSING' end as result
from unnest(array['on_auth_user_created','tickets_before_trg','assets_code_trg','inventory_txn_before_trg','vendor_bills_before_trg',
                  'vendor_payments_after_trg','po_before_trg','license_seat_guard_trg','mnt_code_trg']) as t;

select 'Function exists: ' || f as check_name,
       case when exists (select 1 from pg_proc where proname = f) then 'ok' else 'MISSING' end as result
from unnest(array['next_code','asset_assign','asset_return','asset_transfer','asset_dispose','po_set_status','receive_po_line','convert_request_to_po',
                  'maintenance_complete','generate_alerts','profile_names','attachment_access']) as f;

select 'Storage bucket private: attachments' as check_name,
       case when exists (select 1 from storage.buckets where id = 'attachments' and public = false) then 'ok' else 'MISSING OR PUBLIC' end as result;
