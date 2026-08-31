export const ACCESS_PERMISSIONS = [
  { key: "dashboard", label: "Dashboard", description: "Agency overview, activity, and headline totals." },
  { key: "invoices", label: "Invoices", description: "Create and edit invoices." },
  { key: "quotations", label: "Quotations", description: "Create and edit quotations." },
  { key: "clients", label: "Clients & accounts", description: "Client profiles, invoices, balances, payments, credits, and refunds." },
  { key: "client_portal", label: "Client Portal", description: "Publish monthly client plans and manage the client-facing invoice portal." },
  { key: "employees", label: "Employees", description: "Employee profiles, salaries, commissions, and deductions." },
  { key: "attendance", label: "Attendance & payroll", description: "Biometric imports, attendance reviews, payroll, and Excel exports." },
  { key: "requests", label: "Employee Requests", description: "Submit leave, early-leave excuse, and work-mission requests or review assigned requests." },
  { key: "production", label: "Production", description: "Create, complete, receive, and print locked Media Guide production work orders." },
  { key: "categories", label: "Categories", description: "Service categories, prefixes, counters, and document footers." },
  { key: "all_data", label: "All Data", description: "Document archive, statuses, downloads, and deletion." },
  { key: "settings", label: "Settings", description: "Agency defaults and the user's own login credentials." },
] as const;

export type AccessPermission = (typeof ACCESS_PERMISSIONS)[number]["key"];

export const ALL_ACCESS_PERMISSIONS = ACCESS_PERMISSIONS.map((permission) => permission.key) as AccessPermission[];

export const OPERATION_MANAGER_PERMISSIONS: AccessPermission[] = [
  "dashboard",
  "invoices",
  "quotations",
  "clients",
  "client_portal",
  "categories",
  "all_data",
  "requests",
  "production",
];

export const ACCOUNT_MANAGER_PERMISSIONS: AccessPermission[] = [
  "dashboard",
  "clients",
  "client_portal",
  "production",
];

export const PRODUCTION_MANAGER_PERMISSIONS: AccessPermission[] = [
  "dashboard",
  "production",
];

const permissionSet = new Set<string>(ALL_ACCESS_PERMISSIONS);

export function normalizePermissions(value: unknown): AccessPermission[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((permission): permission is AccessPermission => typeof permission === "string" && permissionSet.has(permission)))];
}

export function parsePermissions(value: string) {
  try {
    return normalizePermissions(JSON.parse(value));
  } catch {
    return [];
  }
}

export function canAccess(permissions: AccessPermission[], permission: AccessPermission, isAdmin = false) {
  return isAdmin || permissions.includes(permission);
}
