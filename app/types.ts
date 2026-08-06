import type { AccessPermission } from "./lib/permissions";

export type Client = {
  id: number;
  name: string;
  companyName: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: number;
  name: string;
  prefix: string;
  footerText1: string;
  footerText2: string;
  counter: number;
  createdAt: string;
  updatedAt: string;
};

export type LineItem = {
  id: string;
  date: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
};

export type DocumentRecord = {
  id: number;
  type: "invoice" | "quotation";
  generatedCode: string;
  clientId: number;
  categoryId: number;
  clientName: string;
  companyName: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  categoryName: string;
  categoryPrefix: string;
  footerText1: string;
  footerText2: string;
  date: string;
  validUntil: string;
  preparedBy: string;
  currency: string;
  project: string;
  status: string;
  items: LineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentTerms: string;
  notesExclusions: string;
  pdfKey: string;
  createdAt: string;
  updatedAt: string;
};

export type Settings = {
  id: number;
  agencyName: string;
  defaultCurrency: string;
  preparedBy: string;
  defaultPaymentTerms: string;
  defaultTax: number;
  phone: string;
  email: string;
  address: string;
  updatedAt: string;
};

export type AppState = {
  clients: Client[];
  categories: Category[];
  documents: DocumentRecord[];
  settings: Settings;
};

export type Employee = {
  id: number;
  biometricCode: string;
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  hireDate: string;
  baseSalary: number;
  monthlyCommission: number;
  monthlyDeduction: number;
  active: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type HrPolicy = {
  id: number;
  currency: string;
  salaryDivisor: number;
  workdayMinutes: number;
  freeArrivalUntil: string;
  minorLateUntil: string;
  quarterDayUntil: string;
  overtimeStartsAt: string;
  overtimeArrivalCutoff: string;
  minutePenaltyMultiplier: number;
  overtimeMultiplier: number;
  fridayMultiplier: number;
  absenceDeductionEnabled: boolean;
  absenceDayMultiplier: number;
  updatedAt: string;
};

export type AttendanceStatus = "present" | "incomplete" | "absent" | "friday" | "vacation" | "sick_leave" | "urgent_leave" | "normal_leave" | "assignment";

export type AttendanceRecord = {
  id: number;
  importId: number | null;
  employeeId: number;
  employeeName: string;
  biometricCode: string;
  workDate: string;
  firstIn: string;
  lastOut: string;
  punches: string[];
  status: AttendanceStatus;
  lateExcused: boolean;
  overtimeApproved: boolean;
  notes: string;
  lateMinutes: number;
  penaltyMinutes: number;
  overtimeMinutes: number;
  lateDeduction: number;
  overtimePay: number;
  fridayPay: number;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceImport = {
  id: number;
  fileName: string;
  periodStart: string;
  periodEnd: string;
  employeeCount: number;
  recordCount: number;
  createdEmployees: number;
  importedAt: string;
};

export type PayrollAdjustment = {
  id: number;
  employeeId: number;
  employeeName: string;
  periodMonth: string;
  type: "commission" | "bonus" | "allowance" | "deduction";
  label: string;
  amount: number;
  notes: string;
  createdAt: string;
};

export type PayrollSummary = {
  employeeId: number;
  employeeName: string;
  title: string;
  baseSalary: number;
  monthlyCommission: number;
  monthlyDeduction: number;
  manualAdditions: number;
  manualDeductions: number;
  lateDeduction: number;
  overtimePay: number;
  fridayPay: number;
  netSalary: number;
  presentDays: number;
  absentDays: number;
  incompleteDays: number;
  lateDays: number;
  lateMinutes: number;
  overtimeMinutes: number;
};

export type HrState = {
  month: string;
  employees: Employee[];
  policy: HrPolicy;
  attendance: AttendanceRecord[];
  imports: AttendanceImport[];
  adjustments: PayrollAdjustment[];
  payroll: PayrollSummary[];
};

export type ManagedUser = {
  id: number;
  username: string;
  displayName: string;
  roleLabel: string;
  isAdmin: boolean;
  active: boolean;
  permissions: AccessPermission[];
  createdAt: string;
  updatedAt: string;
};

export type DocumentDraft = {
  id?: number;
  generatedCode?: string;
  type: "invoice" | "quotation";
  clientId: number;
  categoryId: number;
  date: string;
  validUntil: string;
  preparedBy: string;
  currency: string;
  project: string;
  status: string;
  items: LineItem[];
  discount: number;
  tax: number;
  paymentTerms: string;
  notesExclusions: string;
};
