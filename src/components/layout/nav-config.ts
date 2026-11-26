import {
  LayoutDashboard, ClipboardList, Boxes, Package, ShoppingCart, Wallet, Wrench,
  KeyRound, Network, Building2, FolderOpen, BarChart3, Settings, type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/permissions';

export type NavItem = {
  label: string;
  href: string;
  /** Phase in which the page is built. Phase 1 pages are live; later phases show a status page. */
  phase: 1 | 2 | 3 | 4 | 5 | 6;
  roles?: Role[];
};
export type NavGroup = { label: string; icon: LucideIcon; href?: string; items: NavItem[]; roles?: Role[] };

export const NAV: NavGroup[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', items: [] },
  { label: 'My Assets', icon: Boxes, href: '/my-assets', items: [], roles: ['dept_head', 'employee'] },
  {
    label: 'IT Operations', icon: ClipboardList,
    items: [
      { label: 'Daily Tasks', href: '/operations/tasks', phase: 2, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Helpdesk Tickets', href: '/operations/tickets', phase: 2 },
      { label: 'Activity Logs', href: '/operations/activity-logs', phase: 2, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Calendar', href: '/operations/calendar', phase: 2, roles: ['super_admin', 'it_admin', 'it_member'] },
    ],
  },
  {
    label: 'Asset Management', icon: Boxes,
    items: [
      { label: 'All Assets', href: '/assets', phase: 3, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Asset Allocation', href: '/assets/allocation', phase: 3, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Asset Transfers', href: '/assets/transfers', phase: 3, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Asset Maintenance', href: '/assets/maintenance', phase: 3, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Asset QR Codes', href: '/assets/qr-codes', phase: 3, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Asset Disposal', href: '/assets/disposal', phase: 3, roles: ['super_admin', 'it_admin', 'it_member'] },
    ],
  },
  {
    label: 'Inventory', icon: Package,
    items: [
      { label: 'Stock Overview', href: '/inventory', phase: 3, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Stock In', href: '/inventory/stock-in', phase: 3, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Stock Out', href: '/inventory/stock-out', phase: 3, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Stock Transfers', href: '/inventory/transfers', phase: 3, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Low Stock', href: '/inventory/low-stock', phase: 3, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Stock History', href: '/inventory/history', phase: 3, roles: ['super_admin', 'it_admin', 'it_member'] },
    ],
  },
  {
    label: 'Procurement', icon: ShoppingCart,
    items: [
      { label: 'Purchase Requests', href: '/procurement/requests', phase: 4 },
      { label: 'Purchase Orders', href: '/procurement/orders', phase: 4, roles: ['super_admin', 'it_admin'] },
      { label: 'Goods Received', href: '/procurement/goods-received', phase: 4, roles: ['super_admin', 'it_admin'] },
      { label: 'Vendors', href: '/procurement/vendors', phase: 4, roles: ['super_admin', 'it_admin'] },
    ],
  },
  {
    label: 'Finance & Billing', icon: Wallet,
    items: [
      { label: 'Vendor Bills', href: '/finance/bills', phase: 4, roles: ['super_admin', 'it_admin'] },
      { label: 'Payments', href: '/finance/payments', phase: 4, roles: ['super_admin', 'it_admin'] },
      { label: 'IT Expenses', href: '/finance/expenses', phase: 4, roles: ['super_admin', 'it_admin'] },
      { label: 'Budget Management', href: '/finance/budgets', phase: 4, roles: ['super_admin', 'it_admin'] },
      { label: 'Financial Reports', href: '/finance/reports', phase: 6, roles: ['super_admin', 'it_admin'] },
    ],
  },
  {
    label: 'Maintenance', icon: Wrench,
    items: [
      { label: 'Maintenance Schedule', href: '/maintenance/schedule', phase: 5, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'AMC Management', href: '/maintenance/amc', phase: 5, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Warranty Tracking', href: '/maintenance/warranty', phase: 5, roles: ['super_admin', 'it_admin', 'it_member'] },
      { label: 'Service History', href: '/maintenance/history', phase: 5, roles: ['super_admin', 'it_admin', 'it_member'] },
    ],
  },
  {
    label: 'Software & Licenses', icon: KeyRound,
    items: [
      { label: 'Software Inventory', href: '/software', phase: 5, roles: ['super_admin', 'it_admin'] },
      { label: 'License Allocation', href: '/software/licenses', phase: 5, roles: ['super_admin', 'it_admin'] },
      { label: 'Renewals', href: '/software/renewals', phase: 5, roles: ['super_admin', 'it_admin'] },
    ],
  },
  {
    label: 'Infrastructure', icon: Network, roles: ['super_admin', 'it_admin', 'it_member'],
    items: [
      { label: 'Network Devices', href: '/infrastructure/network', phase: 5 },
      { label: 'IP Management', href: '/infrastructure/ip', phase: 5 },
      { label: 'Servers', href: '/infrastructure/servers', phase: 5 },
      { label: 'CCTV', href: '/infrastructure/cctv', phase: 5 },
    ],
  },
  {
    label: 'Organization', icon: Building2,
    items: [
      { label: 'Employees', href: '/organization/employees', phase: 1, roles: ['super_admin', 'it_admin', 'it_member', 'dept_head'] },
      { label: 'Departments', href: '/organization/departments', phase: 1 },
      { label: 'User Management', href: '/organization/users', phase: 1, roles: ['super_admin'] },
    ],
  },
  { label: 'Documents', icon: FolderOpen, items: [{ label: 'Document Library', href: '/documents', phase: 5, roles: ['super_admin', 'it_admin', 'it_member'] }] },
  { label: 'Reports & Analytics', icon: BarChart3, href: '/reports', items: [], roles: ['super_admin', 'it_admin'] },
  { label: 'Settings', icon: Settings, href: '/settings', items: [], roles: ['super_admin', 'it_admin'] },
];

/** Highest phase delivered so far. Sidebar items from later phases show a phase badge. */
export const BUILT_PHASE = 6;

export const PHASE_NAMES: Record<number, string> = {
  1: 'Core Foundation',
  2: 'IT Operations',
  3: 'Asset & Inventory',
  4: 'Procurement & Finance',
  5: 'Maintenance & Infrastructure',
  6: 'Reports & Automation',
};

/** Find a nav entry (item or top-level link) by pathname, for the "coming in phase N" page. */
export function findNav(pathname: string): { label: string; phase: number } | null {
  for (const g of NAV) {
    if (g.href === pathname) return { label: g.label, phase: g.href === '/reports' ? 6 : 1 };
    for (const i of g.items) if (i.href === pathname) return { label: i.label, phase: i.phase };
  }
  return null;
}
