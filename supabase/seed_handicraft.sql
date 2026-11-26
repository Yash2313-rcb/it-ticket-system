-- Starter data for an embroidery / handicraft clothing manufacturer with a store.
-- Run AFTER migrations 0001-0006. Safe to run more than once. Edit freely.

insert into public.departments(code, name, description) values
  ('MGT', 'Management / Owner',        'Owners and senior management'),
  ('IT',  'IT',                        'IT support (single administrator)'),
  ('DSN', 'Design Studio',             'Pattern, embroidery and handcraft design'),
  ('EMB', 'Embroidery Unit',           'Machine and hand embroidery production'),
  ('STC', 'Stitching and Tailoring',   'Cutting, stitching and finishing'),
  ('FAB', 'Fabric and Raw Material',   'Fabric, thread and material store'),
  ('QC',  'Quality Control',           'Inspection and finishing checks'),
  ('SHW', 'Showroom / Retail Store',   'Store counter, billing and display'),
  ('ONL', 'Online Sales',              'Website, social media and online orders'),
  ('DSP', 'Dispatch and Packing',      'Packing, courier and logistics'),
  ('ACC', 'Accounts',                  'Accounts, billing and GST'),
  ('HR',  'HR and Admin',              'HR, attendance and administration')
on conflict do nothing;

insert into public.asset_categories(name, sort_order) values
  ('POS / Billing Terminals', 20), ('Barcode / Label Printers', 21), ('Barcode Scanners', 22),
  ('Computerised Embroidery Machine PCs', 23), ('Design Workstations', 24), ('Large-format Printers / Plotters', 25),
  ('Tablets / Mobile Devices', 26), ('Attendance Machines', 27), ('Cash Drawers', 28), ('Display Screens / Digital Signage', 29)
on conflict do nothing;

insert into public.ticket_categories(name, sort_order) values
  ('POS / Billing Software', 11), ('Embroidery Machine Software', 12), ('Design Software', 13),
  ('Website / Online Store', 14), ('WhatsApp / Social Media Accounts', 15), ('Attendance Machine', 16), ('Barcode / Label Printing', 17)
on conflict do nothing;

insert into public.task_categories(name, sort_order) values
  ('POS / Billing Support', 11), ('Website and Online Store', 12), ('Backup and Data Safety', 13), ('Machine PC Support', 14)
on conflict do nothing;
