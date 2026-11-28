import type { ModuleConfig, ModField } from './types';
import type { Role } from '@/lib/permissions';

const A: Role[] = ['super_admin', 'it_admin'];
const S: Role[] = ['super_admin', 'it_admin', 'it_member'];
const ALL: Role[] = ['super_admin', 'it_admin', 'it_member', 'dept_head', 'employee'];

const opts = (pairs: string[]): [string, string][] =>
  pairs.map((p) => [p, p.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())]);
const pick = (...pairs: [string, string][]) => pairs;

export const PRIORITY_OPTIONS = opts(['low', 'medium', 'high', 'critical']);
export const EXPENSE_CATEGORIES = [
  'Hardware Purchases', 'Software Purchases', 'Internet Charges', 'Telephone Charges', 'Printer Maintenance',
  'Computer Repair', 'Server Expenses', 'Cloud Hosting', 'Domain Renewal', 'Website and Online Store', 'POS / Billing Software', 'Software Subscription',
  'AMC Charges', 'Accessories', 'Travel Expenses', 'Other IT Expenses',
];
const INVENTORY_CATEGORIES = [
  'Printer Toner', 'Printer Ink', 'Cartridges', 'LAN Cables', 'Connectors', 'HDMI Cables', 'USB Cables', 'Keyboards',
  'Mouse', 'Power Adapters', 'RAM', 'SSD', 'HDD', 'Thermal Printer Rolls', 'Barcode Labels', 'Network Accessories', 'Computer Spare Parts', 'Batteries', 'Other IT Consumables',
];
const catOpts = (list: string[]): [string, string][] => list.map((c) => [c, c]);
const MAINT_TYPES = opts(['computer', 'printer', 'server', 'network', 'firewall', 'cctv', 'ups', 'antivirus_update', 'backup_verification', 'other']);
const RENEWAL = opts(['active', 'renewal_due', 'renewed', 'expired', 'cancelled']);

const dept: ModField = { name: 'department_id', label: 'Department', type: 'select', ref: { table: 'departments', label: 'name' } };
const vendor: ModField = { name: 'vendor_id', label: 'Vendor', type: 'select', ref: { table: 'vendors', label: 'company_name' } };
const staffRef = (name: string, label: string): ModField => ({ name, label, type: 'select', ref: { table: 'profiles', label: 'full_name', where: ['is_active', 'true'] } });

const networkTypes = (list: string[]) => opts(list);

const networkConfig = (key: string, title: string, singular: string, types: string[], base: ModuleConfig['base']): ModuleConfig => ({
  key, table: 'network_devices', title, singular, readRoles: S, writeRoles: A,
  description: 'Sensitive network details. IT staff can view; administrators can change.',
  select: '*, profiles(full_name)',
  cols: [
    { label: 'ID', path: 'device_code' }, { label: 'Name', path: 'device_name' }, { label: 'Type', path: 'device_type', type: 'badge' },
    { label: 'IP address', path: 'ip_address' }, { label: 'MAC', path: 'mac_address' }, { label: 'Location', path: 'location' },
    { label: 'Responsible', path: 'profiles.full_name' }, { label: 'Status', path: 'status', type: 'badge' },
  ],
  fields: [
    { name: 'device_name', label: 'Device name', type: 'text', required: true },
    { name: 'device_type', label: 'Type', type: 'select', required: true, options: networkTypes(types), default: types[0] },
    { name: 'ip_address', label: 'IP address', type: 'text' }, { name: 'mac_address', label: 'MAC address', type: 'text' },
    { name: 'location', label: 'Location', type: 'text' }, { name: 'model', label: 'Model', type: 'text' },
    { name: 'serial_number', label: 'Serial number', type: 'text' }, { name: 'network_segment', label: 'Network segment', type: 'text' },
    { name: 'installation_date', label: 'Installation date', type: 'date' }, staffRef('responsible_person', 'Responsible person'),
    { name: 'status', label: 'Status', type: 'select', required: true, options: opts(['active', 'inactive', 'faulty', 'retired']), default: 'active' },
    { name: 'remarks', label: 'Remarks', type: 'textarea' },
  ],
  search: ['device_name', 'device_code', 'ip_address', 'serial_number', 'location'],
  filters: [{ name: 'status', label: 'Any status', options: opts(['active', 'inactive', 'faulty', 'retired']) }],
  base, order: ['device_name', true], codeField: 'device_code',
});

const list: ModuleConfig[] = [
  {
    key: 'vendors', table: 'vendors', title: 'Vendors', singular: 'vendor', description: 'Supplier master. Bank details are visible to administrators only.',
    readRoles: A, writeRoles: A, select: '*',
    cols: [
      { label: 'ID', path: 'vendor_code' }, { label: 'Company', path: 'company_name' }, { label: 'Contact', path: 'contact_person' },
      { label: 'Mobile', path: 'mobile' }, { label: 'GSTIN', path: 'gstin' }, { label: 'Category', path: 'category', type: 'badge' }, { label: 'Status', path: 'status', type: 'badge' },
    ],
    fields: [
      { name: 'company_name', label: 'Company name', type: 'text', required: true }, { name: 'contact_person', label: 'Contact person', type: 'text' },
      { name: 'mobile', label: 'Mobile number', type: 'text' }, { name: 'email', label: 'Email', type: 'email' },
      { name: 'gstin', label: 'GSTIN', type: 'text', placeholder: '24ABCDE1234F1Z5' }, { name: 'pan', label: 'PAN', type: 'text' },
      { name: 'category', label: 'Category', type: 'select', required: true, default: 'other',
        options: pick(['computer', 'Computer suppliers'], ['hardware', 'Hardware suppliers'], ['printer', 'Printer suppliers'], ['networking', 'Networking suppliers'], ['software', 'Software vendors'], ['amc', 'AMC service providers'], ['cctv', 'CCTV vendors'], ['isp', 'Internet service providers'], ['other', 'Other IT vendors']) },
      { name: 'payment_terms', label: 'Payment terms', type: 'text', placeholder: 'e.g. 30 days' },
      { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'bank_details', label: 'Bank details', type: 'textarea', hint: 'Restricted: only administrators can see vendors.' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: opts(['active', 'inactive']), default: 'active' },
      { name: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    search: ['company_name', 'vendor_code', 'contact_person', 'gstin', 'mobile'],
    filters: [{ name: 'status', label: 'Any status', options: opts(['active', 'inactive']) }],
    order: ['company_name', true], codeField: 'vendor_code',
  },
  {
    key: 'assets', table: 'assets', title: 'All assets', singular: 'asset', description: 'IT asset register. Open an asset for allocation, QR code, history and documents.',
    readRoles: S, writeRoles: A,
    select: '*, asset_categories(name), departments(name), employees(full_name), vendors(company_name)',
    cols: [
      { label: 'Asset ID', path: 'asset_code', href: '/assets/{id}' }, { label: 'Name', path: 'name' }, { label: 'Category', path: 'asset_categories.name' },
      { label: 'Serial no.', path: 'serial_number' }, { label: 'Department', path: 'departments.name' }, { label: 'Assigned to', path: 'employees.full_name' },
      { label: 'Warranty ends', path: 'warranty_end', type: 'expiry' }, { label: 'Status', path: 'status', type: 'badge' },
    ],
    fields: [
      { name: 'name', label: 'Asset name', type: 'text', required: true },
      { name: 'category_id', label: 'Category', type: 'select', required: true, ref: { table: 'asset_categories', label: 'name', where: ['is_active', 'true'] } },
      { name: 'brand', label: 'Brand', type: 'text' }, { name: 'model_number', label: 'Model number', type: 'text' },
      { name: 'serial_number', label: 'Serial number', type: 'text' }, { name: 'invoice_number', label: 'Invoice number', type: 'text' },
      { name: 'purchase_date', label: 'Purchase date', type: 'date' }, { name: 'purchase_price', label: 'Purchase price (INR)', type: 'money' },
      vendor, { name: 'location', label: 'Location', type: 'text' },
      { name: 'warranty_start', label: 'Warranty start', type: 'date' }, { name: 'warranty_end', label: 'Warranty end', type: 'date' },
      { ...dept, label: 'Department', hint: 'Set automatically when assigned to an employee.' },
      { name: 'condition', label: 'Condition', type: 'select', required: true, options: opts(['new', 'good', 'fair', 'poor']), default: 'good' },
      { name: 'status', label: 'Status', type: 'select', required: true, default: 'available', editOnly: true,
        options: opts(['available', 'under_maintenance', 'damaged', 'lost', 'retired']), hint: 'Use Assign, Return, Transfer and Dispose on the asset page for the other statuses.' },
      { name: 'amc_details', label: 'AMC details', type: 'textarea' }, { name: 'specifications', label: 'Specifications', type: 'textarea' }, { name: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    search: ['asset_code', 'name', 'serial_number', 'brand', 'model_number', 'invoice_number'],
    filters: [
      { name: 'status', label: 'Any status', options: opts(['available', 'assigned', 'in_use', 'under_maintenance', 'damaged', 'lost', 'retired', 'disposed']) },
      { name: 'category_id', label: 'All categories', options: [] },
    ],
    order: ['created_at', false], codeField: 'asset_code',
  },
  {
    key: 'inventory_items', table: 'inventory_items', title: 'Stock overview', singular: 'item', description: 'Consumables and spare parts. Quantities change only through stock transactions.',
    readRoles: S, writeRoles: A, select: '*, vendors(company_name)',
    cols: [
      { label: 'Item ID', path: 'item_code' }, { label: 'Name', path: 'name' }, { label: 'Category', path: 'category' }, { label: 'Brand', path: 'brand' },
      { label: 'Available', path: 'available_qty', type: 'qty', minPath: 'min_stock' }, { label: 'Unit', path: 'unit' }, { label: 'Minimum', path: 'min_stock', type: 'number' },
      { label: 'Unit price', path: 'unit_price', type: 'money' }, { label: 'Location', path: 'storage_location' },
    ],
    fields: [
      { name: 'name', label: 'Item name', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'select', required: true, options: catOpts(INVENTORY_CATEGORIES), default: 'Other IT Consumables' },
      { name: 'brand', label: 'Brand', type: 'text' }, { name: 'model', label: 'Model', type: 'text' },
      { name: 'unit', label: 'Unit', type: 'text', required: true, default: 'nos' },
      { name: 'opening_stock', label: 'Opening stock', type: 'number', min: 0, default: 0, readOnlyOnEdit: true, hint: 'Fixed once created. Use stock transactions afterwards.' },
      { name: 'min_stock', label: 'Minimum stock level', type: 'number', min: 0, default: 0 }, { name: 'unit_price', label: 'Unit purchase price (INR)', type: 'money', default: 0 },
      { name: 'storage_location', label: 'Storage location', type: 'text' }, vendor,
      { name: 'is_active', label: 'Active', type: 'checkbox', default: true }, { name: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    search: ['item_code', 'name', 'brand', 'model'],
    filters: [{ name: 'category', label: 'All categories', options: catOpts(INVENTORY_CATEGORIES) }],
    order: ['name', true], codeField: 'item_code',
  },
  {
    key: 'purchase_requests', table: 'purchase_requests', title: 'Purchase requests', singular: 'request',
    description: 'Raise a request for hardware or software. Approved requests can be converted into purchase orders.',
    readRoles: ALL, writeRoles: [...A, 'dept_head'], createRoles: ALL, stampCreator: 'requested_by',
    select: '*, departments(name)',
    cols: [
      { label: 'Request', path: 'request_code' }, { label: 'Date', path: 'request_date', type: 'date' }, { label: 'Item', path: 'item_name' },
      { label: 'Qty', path: 'quantity', type: 'number' }, { label: 'Est. unit price', path: 'estimated_price', type: 'money' }, { label: 'Department', path: 'departments.name' },
      { label: 'Priority', path: 'priority', type: 'badge' }, { label: 'Approval', path: 'approval_status', type: 'badge' },
    ],
    fields: [
      { name: 'item_name', label: 'Item name', type: 'text', required: true }, { name: 'quantity', label: 'Quantity', type: 'number', required: true, min: 1, default: 1 },
      { name: 'estimated_price', label: 'Estimated price per unit (INR)', type: 'money' },
      { name: 'priority', label: 'Priority', type: 'select', required: true, options: PRIORITY_OPTIONS, default: 'medium' },
      { name: 'description', label: 'Description / specification', type: 'textarea' }, { name: 'reason', label: 'Reason for purchase', type: 'textarea', required: true },
      { name: 'approval_status', label: 'Approval status', type: 'select', required: true, editOnly: true, roles: [...A, 'dept_head'],
        options: opts(['pending', 'approved', 'rejected']), default: 'pending' },
    ],
    search: ['request_code', 'item_name'],
    filters: [{ name: 'approval_status', label: 'Any approval status', options: opts(['pending', 'approved', 'rejected', 'converted']) }],
    order: ['created_at', false], codeField: 'request_code', importable: false,
    rowActions: [{ key: 'convert', label: 'Create PO', roles: A, when: ['approval_status', 'approved'], confirm: 'Create a draft purchase order from this request?' }],
    beforeInsert: async (v, ctx) => {
      if (ctx.employeeId) {
        const { data } = await ctx.supabase.from('employees').select('department_id').eq('id', ctx.employeeId).maybeSingle();
        v.department_id = data?.department_id ?? null;
      }
    },
  },
  {
    key: 'expenses', table: 'expenses', title: 'IT expenses', singular: 'expense', readRoles: A, writeRoles: A, stampCreator: 'created_by',
    select: '*, vendors(company_name), departments(name), approver:profiles!expenses_approved_by_fkey(full_name)',
    cols: [
      { label: 'Expense', path: 'expense_code' }, { label: 'Date', path: 'expense_date', type: 'date' }, { label: 'Category', path: 'category' },
      { label: 'Description', path: 'description' }, { label: 'Vendor', path: 'vendors.company_name' }, { label: 'Amount', path: 'amount', type: 'money' },
      { label: 'GST', path: 'gst_amount', type: 'money' }, { label: 'Department', path: 'departments.name' }, { label: 'Approved by', path: 'approver.full_name' },
    ],
    fields: [
      { name: 'expense_date', label: 'Expense date', type: 'date', required: true }, { name: 'category', label: 'Category', type: 'select', required: true, options: catOpts(EXPENSE_CATEGORIES) },
      { name: 'description', label: 'Description', type: 'text', required: true, full: true }, vendor,
      { name: 'amount', label: 'Amount before GST (INR)', type: 'money', required: true }, { name: 'gst_amount', label: 'GST amount (INR)', type: 'money', default: 0 },
      { name: 'payment_mode', label: 'Payment mode', type: 'select', options: opts(['cash', 'cheque', 'bank_transfer', 'upi', 'card', 'other']) },
      { name: 'payment_reference', label: 'Payment reference', type: 'text' }, dept, staffRef('approved_by', 'Approved by'), { name: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    search: ['expense_code', 'description', 'payment_reference'],
    filters: [{ name: 'category', label: 'All categories', options: catOpts(EXPENSE_CATEGORIES) }],
    order: ['expense_date', false], codeField: 'expense_code',
  },
  {
    key: 'amc_contracts', table: 'amc_contracts', title: 'AMC management', singular: 'contract', readRoles: S, writeRoles: A,
    select: '*, assets(asset_code, name), vendors(company_name)',
    cols: [
      { label: 'Contract', path: 'contract_code' }, { label: 'Asset', path: 'assets.asset_code' }, { label: 'Vendor', path: 'vendors.company_name' },
      { label: 'Type', path: 'contract_type', type: 'badge' }, { label: 'Starts', path: 'start_date', type: 'date' }, { label: 'Ends', path: 'end_date', type: 'expiry' },
      { label: 'Amount', path: 'amount', type: 'money' }, { label: 'Frequency', path: 'service_frequency' }, { label: 'Renewal', path: 'renewal_status', type: 'badge' },
    ],
    fields: [
      { name: 'asset_id', label: 'Asset', type: 'select', ref: { table: 'assets', label: 'asset_code,name' } }, vendor,
      { name: 'contract_type', label: 'Contract type', type: 'select', required: true, options: opts(['amc', 'cmc', 'warranty_extension', 'support', 'other']), default: 'amc' },
      { name: 'amount', label: 'Contract amount (INR)', type: 'money' }, { name: 'start_date', label: 'Start date', type: 'date', required: true },
      { name: 'end_date', label: 'End date', type: 'date', required: true }, { name: 'service_frequency', label: 'Service frequency', type: 'text', placeholder: 'e.g. Quarterly' },
      { name: 'service_contact', label: 'Service contact', type: 'text' },
      { name: 'renewal_status', label: 'Renewal status', type: 'select', required: true, options: RENEWAL, default: 'active' }, { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    search: ['contract_code', 'service_contact'],
    filters: [{ name: 'renewal_status', label: 'Any renewal status', options: RENEWAL }],
    order: ['end_date', true], codeField: 'contract_code',
  },
  {
    key: 'maintenance_schedules', table: 'maintenance_schedules', title: 'Maintenance schedule', singular: 'schedule',
    description: 'Preventive maintenance. Recurring schedules create the next visit when one is completed.',
    readRoles: S, writeRoles: A, select: '*, assets(asset_code, name), profiles(full_name)',
    cols: [
      { label: 'Schedule', path: 'schedule_code' }, { label: 'Asset', path: 'assets.asset_code' }, { label: 'Type', path: 'maintenance_type', type: 'badge' },
      { label: 'Scheduled', path: 'scheduled_date', type: 'due' }, { label: 'Technician', path: 'profiles.full_name' }, { label: 'Repeats (days)', path: 'interval_days', type: 'number' },
      { label: 'Completed', path: 'completion_date', type: 'date' }, { label: 'Cost', path: 'cost', type: 'money' }, { label: 'Status', path: 'status', type: 'badge' },
    ],
    fields: [
      { name: 'asset_id', label: 'Asset', type: 'select', ref: { table: 'assets', label: 'asset_code,name' } },
      { name: 'maintenance_type', label: 'Maintenance type', type: 'select', required: true, options: MAINT_TYPES, default: 'computer' },
      { name: 'scheduled_date', label: 'Scheduled date', type: 'date', required: true }, staffRef('assigned_to', 'Assigned technician'),
      { name: 'interval_days', label: 'Repeat every (days)', type: 'number', min: 1, hint: 'Leave blank for a one-off visit.' },
      { name: 'status', label: 'Status', type: 'select', required: true, editOnly: true, options: opts(['scheduled', 'cancelled']), default: 'scheduled' },
      { name: 'checklist', label: 'Checklist', type: 'textarea' }, { name: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
    search: ['schedule_code'], filters: [{ name: 'status', label: 'Any status', options: opts(['scheduled', 'completed', 'cancelled']) }],
    order: ['scheduled_date', true], codeField: 'schedule_code',
    rowActions: [{
      key: 'complete', label: 'Complete', roles: S, when: ['status', 'scheduled'],
      fields: [{ name: 'cost', label: 'Maintenance cost (INR)', type: 'money', default: 0 }, { name: 'remarks', label: 'Work done / service report notes', type: 'textarea' }],
    }],
  },
  {
    key: 'maintenance_records', table: 'maintenance_records', title: 'Service history', singular: 'service record',
    description: 'Completed maintenance, repairs and service visits for assets.', readRoles: S, writeRoles: A, stampCreator: 'created_by',
    select: '*, assets(asset_code, name), vendors(company_name)',
    cols: [
      { label: 'Asset', path: 'assets.asset_code' }, { label: 'Asset name', path: 'assets.name' }, { label: 'Type', path: 'maintenance_type' }, { label: 'Date', path: 'service_date', type: 'date' },
      { label: 'Vendor', path: 'vendors.company_name' }, { label: 'Technician', path: 'technician' }, { label: 'Cost', path: 'cost', type: 'money' }, { label: 'Details', path: 'description' },
    ],
    fields: [
      { name: 'asset_id', label: 'Asset', type: 'select', required: true, ref: { table: 'assets', label: 'asset_code,name' } },
      { name: 'maintenance_type', label: 'Type of work', type: 'text', required: true, placeholder: 'e.g. Repair, Servicing, Cleaning' },
      { name: 'service_date', label: 'Service date', type: 'date', required: true }, vendor, { name: 'technician', label: 'Technician', type: 'text' },
      { name: 'cost', label: 'Cost (INR)', type: 'money', default: 0 }, { name: 'description', label: 'Details', type: 'textarea' },
    ],
    search: ['maintenance_type', 'technician', 'description'], order: ['service_date', false],
  },
  {
    key: 'software_licenses', table: 'software_licenses', title: 'Software inventory', singular: 'software licence',
    description: 'Licences and subscriptions. Licence keys are visible to administrators only.', readRoles: A, writeRoles: A, select: '*, vendors(company_name)',
    cols: [
      { label: 'Software', path: 'software_name' }, { label: 'Vendor', path: 'vendors.company_name' }, { label: 'Category', path: 'category', type: 'badge' },
      { label: 'Type', path: 'license_type', type: 'badge' }, { label: 'Seats', path: 'license_count', type: 'number' }, { label: 'Expires', path: 'expiry_date', type: 'expiry' },
      { label: 'Renewal cost', path: 'renewal_cost', type: 'money' }, { label: 'Renewal', path: 'renewal_status', type: 'badge' },
    ],
    fields: [
      { name: 'software_name', label: 'Software name', type: 'text', required: true }, vendor,
      { name: 'category', label: 'Category', type: 'select', required: true, options: opts(['office', 'antivirus', 'operating_system', 'erp', 'accounting', 'cloud', 'other']), default: 'other' },
      { name: 'license_type', label: 'Licence type', type: 'select', required: true, options: opts(['perpetual', 'subscription', 'oem', 'volume', 'open_source']), default: 'subscription' },
      { name: 'license_key', label: 'Licence key', type: 'text', full: true }, { name: 'license_count', label: 'Licence count (seats)', type: 'number', required: true, min: 1, default: 1 },
      { name: 'subscription_type', label: 'Subscription', type: 'select', required: true, options: opts(['monthly', 'quarterly', 'yearly', 'none']), default: 'yearly' },
      { name: 'purchase_date', label: 'Purchase date', type: 'date' }, { name: 'expiry_date', label: 'Expiry date', type: 'date' },
      { name: 'renewal_cost', label: 'Renewal cost (INR)', type: 'money' }, { name: 'renewal_status', label: 'Renewal status', type: 'select', required: true, options: RENEWAL, default: 'active' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    search: ['software_name'], filters: [{ name: 'category', label: 'All categories', options: opts(['office', 'antivirus', 'operating_system', 'erp', 'accounting', 'cloud', 'other']) }],
    order: ['software_name', true],
  },
  networkConfig('network_devices', 'Network devices', 'device', ['router', 'switch', 'firewall', 'access_point', 'internet', 'rack', 'ups', 'other'], { col: 'device_type', op: 'not_in', value: ['server', 'cctv', 'nvr_dvr'] }),
  networkConfig('servers', 'Servers', 'server', ['server'], { col: 'device_type', op: 'eq', value: 'server' }),
  networkConfig('cctv', 'CCTV systems', 'CCTV device', ['cctv', 'nvr_dvr'], { col: 'device_type', op: 'in', value: ['cctv', 'nvr_dvr'] }),
  {
    key: 'ip_addresses', table: 'ip_addresses', title: 'IP management', singular: 'IP address', readRoles: S, writeRoles: A, select: '*, network_devices(device_name)',
    cols: [
      { label: 'IP address', path: 'ip_address' }, { label: 'Segment', path: 'network_segment' }, { label: 'Device', path: 'network_devices.device_name' },
      { label: 'Assigned to', path: 'assigned_to' }, { label: 'Status', path: 'status', type: 'badge' },
    ],
    fields: [
      { name: 'ip_address', label: 'IP address', type: 'text', required: true }, { name: 'network_segment', label: 'Network segment', type: 'text' },
      { name: 'device_id', label: 'Device', type: 'select', ref: { table: 'network_devices', label: 'device_name' } }, { name: 'assigned_to', label: 'Assigned to', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: opts(['in_use', 'free', 'reserved']), default: 'in_use' }, { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    search: ['ip_address', 'assigned_to', 'network_segment'], filters: [{ name: 'status', label: 'Any status', options: opts(['in_use', 'free', 'reserved']) }],
    order: ['ip_address', true],
  },
  {
    key: 'budgets', table: 'budgets', title: 'Budgets', singular: 'budget', readRoles: A, writeRoles: A, select: '*, departments(name)', cols: [],
    fields: [
      { name: 'financial_year', label: 'Financial year (April to March)', type: 'select', required: true, options: [] },
      { name: 'category', label: 'Budget category', type: 'select', required: true, options: catOpts(EXPENSE_CATEGORIES) },
      { ...dept, hint: 'Leave blank for an all-department budget.' },
      { name: 'month', label: 'Month', type: 'select', hint: 'Leave blank for an annual budget.', options: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i): [string, string] => [String(i + 1), m]) },
      { name: 'allocated_amount', label: 'Allocated budget (INR)', type: 'money', required: true }, { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    search: [], order: ['category', true],
  },
];

export const MODULES: Record<string, ModuleConfig> = Object.fromEntries(list.map((m) => [m.key, m]));

/** Financial years offered in the budget form: previous, current and next. */
export function financialYearOptions(): [string, string][] {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [start - 1, start, start + 1].map((y): [string, string] => {
    const fy = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    return [fy, `FY ${fy}`];
  });
}
export const currentFinancialYear = () => financialYearOptions()[1][0];

// Options that depend on today's date
MODULES.budgets.fields[0].options = financialYearOptions();
