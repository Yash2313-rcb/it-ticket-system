import type { Role } from '@/lib/permissions';

export type FieldType = 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'checkbox' | 'email' | 'file';

/** Serializable field definition passed to the client form. */
export type FormField = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: [string, string][];
  default?: string | number | boolean | null;
  hint?: string;
  full?: boolean;
  placeholder?: string;
};

export type ModField = FormField & {
  ref?: { table: string; label: string; where?: [string, string] };
  roles?: Role[];
  editOnly?: boolean;
  readOnlyOnEdit?: boolean;
  min?: number;
};

export type Col = {
  label: string;
  path: string;
  type?: 'text' | 'money' | 'date' | 'badge' | 'number' | 'bool' | 'qty' | 'expiry' | 'due';
  href?: string; // e.g. '/assets/{id}'
  minPath?: string;
};

export type RowAction = {
  key: string;
  label: string;
  roles: Role[];
  when?: [string, string];
  confirm?: string;
  fields?: FormField[];
};

export type ModuleConfig = {
  key: string;
  table: string;
  title: string;
  singular: string;
  description?: string;
  readRoles: Role[];
  writeRoles: Role[];
  createRoles?: Role[];
  select: string;
  cols: Col[];
  fields: ModField[];
  search: string[];
  filters?: { name: string; label: string; options: [string, string][] }[];
  base?: { col: string; op: 'eq' | 'in' | 'not_in'; value: string | string[] };
  order: [string, boolean];
  codeField?: string;
  stampCreator?: string;
  rowActions?: RowAction[];
  beforeInsert?: (values: Record<string, any>, ctx: { meId: string; employeeId: string | null; supabase: any }) => Promise<void>;
};
