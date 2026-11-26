-- Optional starter data. Safe to edit before running.
insert into public.departments(code, name, description) values
  ('IT',   'Information Technology', 'IT department'),
  ('PRD',  'Production',             'Shop floor and production planning'),
  ('QC',   'Quality Control',        'Inspection and quality assurance'),
  ('STR',  'Stores',                 'Raw material and spares stores'),
  ('HR',   'Human Resources',        'HR and administration'),
  ('ACC',  'Accounts & Finance',     'Accounts, billing and finance'),
  ('MNT',  'Maintenance',            'Plant and machinery maintenance'),
  ('DSP',  'Dispatch & Logistics',   'Dispatch, packing and logistics'),
  ('PUR',  'Purchase',               'Procurement')
on conflict do nothing;
