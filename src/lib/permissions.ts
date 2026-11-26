export type Role = 'super_admin' | 'it_admin' | 'it_member' | 'dept_head' | 'employee';

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  it_admin: 'IT Administrator',
  it_member: 'IT Team Member',
  dept_head: 'Department Head',
  employee: 'Employee',
};

export const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

export const ADMIN_ROLES: Role[] = ['super_admin', 'it_admin'];
export const IT_STAFF_ROLES: Role[] = ['super_admin', 'it_admin', 'it_member'];

export const isAdmin = (r?: string | null) => !!r && ADMIN_ROLES.includes(r as Role);
export const isSuperAdmin = (r?: string | null) => r === 'super_admin';
export const isItStaff = (r?: string | null) => !!r && IT_STAFF_ROLES.includes(r as Role);

/**
 * UI-level gating only. The database (RLS policies in supabase/migrations) is the
 * real security boundary - these helpers just hide things people cannot use.
 */
export const can = {
  manageUsers: (r?: string | null) => isSuperAdmin(r),
  writeEmployees: (r?: string | null) => isAdmin(r),
  writeDepartments: (r?: string | null) => isAdmin(r),
  viewEmployees: (r?: string | null) => isItStaff(r) || r === 'dept_head',
  manageSettings: (r?: string | null) => isSuperAdmin(r),
  viewAudit: (r?: string | null) => isAdmin(r),
};
