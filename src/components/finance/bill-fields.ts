import type { FormField } from '@/lib/modules/types';

export const billFields = (vendors: [string, string][], pos: [string, string][]): FormField[] => [
  { name: 'vendor_id', label: 'Vendor', type: 'select', required: true, options: vendors },
  { name: 'invoice_number', label: 'Invoice number', type: 'text', required: true },
  { name: 'invoice_date', label: 'Invoice date', type: 'date', required: true, default: new Date().toISOString().slice(0, 10) },
  { name: 'due_date', label: 'Due date', type: 'date' },
  { name: 'po_id', label: 'Purchase order', type: 'select', options: pos },
  { name: 'description', label: 'Description', type: 'text' },
  { name: 'subtotal', label: 'Subtotal before GST (INR)', type: 'money', required: true },
  { name: 'discount', label: 'Discount (INR)', type: 'money', default: 0 },
  { name: 'tax_treatment', label: 'GST treatment', type: 'select', required: true, default: 'intra_state',
    options: [['intra_state', 'Within state (CGST + SGST)'], ['inter_state', 'Other state (IGST)'], ['exempt', 'Exempt / no GST']], hint: 'CGST, SGST, IGST and the total are calculated on the server.' },
  { name: 'gst_rate', label: 'GST rate (%)', type: 'number', default: 18 },
  { name: 'other_charges', label: 'Other charges (INR)', type: 'money', default: 0 },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];
