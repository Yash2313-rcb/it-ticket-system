import { MODULES } from '@/lib/modules/registry';
import type { FieldType } from '@/lib/modules/types';
import type { Role } from '@/lib/permissions';

export type ImportField = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: [string, string][];
  ref?: { table: string; label: string; where?: [string, string] };
  default?: string | number | boolean | null;
  min?: number;
  roles?: Role[];
  hint?: string;
};

export type ImportSpec = {
  key: string;
  title: string;
  singular: string;
  table: string;
  roles: Role[];
  fields: ImportField[];
  codeField?: string;
  stampCreator?: string;
  /** Extra per-row rules, return an error message to reject the row. */
  validate?: (v: Record<string, any>) => string | null;
  /** Tidy values just before saving. */
  finish?: (v: Record<string, any>) => void;
};

const ADMINS: Role[] = ['super_admin', 'it_admin'];

const CUSTOM: Record<string, ImportSpec> = {
  employees: {
    key: 'employees', title: 'Employees', singular: 'employee', table: 'employees', roles: ADMINS, codeField: 'emp_code',
    fields: [
      { name: 'emp_code', label: 'Employee ID', type: 'text', hint: 'Leave blank to generate EMP-0001 style IDs.' },
      { name: 'full_name', label: 'Full name', type: 'text', required: true },
      { name: 'department_id', label: 'Department', type: 'select', required: true, ref: { table: 'departments', label: 'name', where: ['is_active', 'true'] }, hint: 'Use the exact department name.' },
      { name: 'designation', label: 'Designation', type: 'text' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Contact number', type: 'text' },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'joining_date', label: 'Joining date', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['inactive', 'Inactive']], default: 'active' },
    ],
    validate: (v) => (v.phone && !/^[0-9+\-\s()]{7,15}$/.test(v.phone) ? 'Contact number is not valid (7-15 digits).' : v.full_name && String(v.full_name).length < 2 ? 'Full name is too short.' : null),
  },
  departments: {
    key: 'departments', title: 'Departments', singular: 'department', table: 'departments', roles: ADMINS,
    fields: [
      { name: 'code', label: 'Code', type: 'text', required: true, hint: 'Short code, up to 12 characters.' },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'is_active', label: 'Active', type: 'checkbox', default: true },
    ],
    validate: (v) => (v.code && String(v.code).length > 12 ? 'Code can be at most 12 characters.' : null),
    finish: (v) => { if (v.code) v.code = String(v.code).toUpperCase(); },
  },
};

/** The import definition for a registry module or one of the custom pages. Null when import is not offered. */
export function getImportSpec(key: string): ImportSpec | null {
  if (CUSTOM[key]) return CUSTOM[key];
  const cfg = MODULES[key];
  if (!cfg || cfg.importable === false) return null;
  return {
    key: cfg.key, title: cfg.title, singular: cfg.singular, table: cfg.table,
    roles: cfg.createRoles ?? cfg.writeRoles, codeField: cfg.codeField, stampCreator: cfg.stampCreator,
    fields: cfg.fields
      .filter((f) => !f.editOnly && f.type !== 'file')
      .map((f): ImportField => ({
        name: f.name, label: f.label, type: f.type, required: f.required, options: f.options, ref: f.ref,
        default: f.default, min: f.min, roles: f.roles, hint: f.hint,
      })),
  };
}

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
