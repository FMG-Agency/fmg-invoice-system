import type { AccessPermission } from "./lib/permissions";

export type CompanyKey = "fmg" | "digital_empire";

export type Client = {
  id: number;
  name: string;
  companyName: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  agencyKey: CompanyKey;
  lifecycleStatus: "active" | "inactive" | "shoot" | "prospect";
  activity: string;
  startDate: string;
  paymentSchedule: string;
  monthlyFee: number;
  contractStatus: "contract" | "no_contract" | "not_set";
  relationshipStage: "new" | "old" | "";
  portalLogoAvailable?: boolean;
  portalLogoUpdatedAt?: string;
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
  kind: "package" | "addon" | "custom";
  catalogId: number | null;
  includedServices: string[];
  inputs: string[];
  outputs: string[];
  appliesTo: string;
  bundleTotal: number | null;
};

export type QuotationCatalogItem = {
  id: number;
  kind: "package" | "addon";
  name: string;
  price: number;
  includedServices: string[];
  inputs: string[];
  outputs: string[];
  appliesTo: string;
  bundleTotal: number | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DocumentRecord = {
  id: number;
  type: "invoice" | "quotation";
  companyKey: CompanyKey;
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
  productionWorkOrderId?: number | null;
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
  quotationCatalog: QuotationCatalogItem[];
  settings: Settings;
};

export type ClientFinancialTransactionType = "charge" | "payment" | "credit" | "refund";

export type ClientFinancialTransaction = {
  id: number;
  clientId: number;
  documentId: number | null;
  documentCode: string;
  type: ClientFinancialTransactionType;
  amount: number;
  currency: string;
  transactionDate: string;
  paymentMethod: string;
  reference: string;
  notes: string;
  sourceKey: string;
  createdBy: number | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientAccountDocument = {
  id: number;
  type: "invoice" | "quotation";
  companyKey: CompanyKey;
  generatedCode: string;
  date: string;
  validUntil: string;
  project: string;
  status: string;
  total: number;
  currency: string;
  paid: number;
  credited: number;
  refunded: number;
  remaining: number;
  inferredPaid: number;
};

export type ClientAccountCurrencySummary = {
  currency: string;
  totalInvoiced: number;
  totalCharges: number;
  draftValue: number;
  totalPaid: number;
  totalCredited: number;
  totalRefunded: number;
  outstanding: number;
  clientCredit: number;
};

export type ClientAccountState = {
  client: Client;
  invoices: ClientAccountDocument[];
  quotations: ClientAccountDocument[];
  transactions: ClientFinancialTransaction[];
  summaries: ClientAccountCurrencySummary[];
};

export type ClientMonthlyRetainerStatus = "planned" | "confirmed" | "paused";

export type ClientMonthlyRetainer = {
  id: number;
  clientId: number;
  year: number;
  month: number;
  amount: number;
  status: ClientMonthlyRetainerStatus;
  notes: string;
  sourceKey: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientFinanceSummary = {
  clientId: number;
  totalInvoiced: number;
  totalCharges: number;
  totalPaid: number;
  totalCredited: number;
  totalRefunded: number;
  balance: number;
  plannedYear: number;
  currentMonthPlan: number;
};

export type ClientFinanceState = {
  year: number;
  clients: Client[];
  retainers: ClientMonthlyRetainer[];
  summaries: ClientFinanceSummary[];
  importedWorkbook: boolean;
};

export type ClientPortalPlanPart = {
  id: number;
  clientId: number;
  year: number;
  month: number;
  part: 1 | 2;
  title: string;
  url: string;
  notes: string;
  published: boolean;
  createdBy: number | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientPortalState = {
  viewerMode: "client" | "staff";
  client: Client | null;
  clients: Array<Client & { portalUsername: string }>;
  year: number;
  years: number[];
  invoices: ClientAccountDocument[];
  summaries: ClientAccountCurrencySummary[];
  plans: ClientPortalPlanPart[];
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
  policyVersion: number;
  currency: string;
  salaryDivisor: number;
  workdayMinutes: number;
  workdayStartsAt: string;
  freeArrivalUntil: string;
  minorLateUntil: string;
  quarterDayUntil: string;
  workdayEndsAt: string;
  overtimeStartsAt: string;
  overtimeApprovalAfter: string;
  overtimeArrivalCutoff: string;
  minutePenaltyMultiplier: number;
  overtimeMultiplier: number;
  earlyOvertimeMultiplier: number;
  fridayMultiplier: number;
  earlyLeaveDayMultiplier: number;
  unpaidLeaveDayMultiplier: number;
  urgentLeaveDeadline: string;
  urgentLeaveYearLimit: number;
  sickReportAfterDays: number;
  resortLeaveDays: number;
  resortNoticeDays: number;
  normalLeaveNoticeDays: number;
  absenceDeductionEnabled: boolean;
  absenceDayMultiplier: number;
  updatedAt: string;
};

export type AttendanceStatus = "present" | "incomplete" | "absent" | "friday" | "vacation" | "occasional_leave" | "resort_leave" | "sick_leave" | "urgent_leave" | "normal_leave" | "assignment";

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
  earlyLeaveExcused: boolean;
  leavePaid: boolean;
  overtimeApproved: boolean;
  earlyOvertimeApproved: boolean;
  notes: string;
  lateMinutes: number;
  penaltyMinutes: number;
  earlyLeaveMinutes: number;
  normalOvertimeMinutes: number;
  overtimeMinutes: number;
  earlyOvertimeMinutes: number;
  missionOvertimeMinutes: number;
  normalMissionMinutes: number;
  earlyMissionMinutes: number;
  totalMissionMinutes: number;
  lateDeduction: number;
  earlyLeaveDeduction: number;
  leaveDeduction: number;
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
  earlyLeaveDeduction: number;
  leaveDeduction: number;
  attendanceDeduction: number;
  overtimePay: number;
  fridayPay: number;
  netSalary: number;
  presentDays: number;
  absentDays: number;
  incompleteDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  unpaidLeaveDays: number;
  lateMinutes: number;
  normalOvertimeMinutes: number;
  overtimeMinutes: number;
  earlyOvertimeMinutes: number;
  missionOvertimeMinutes: number;
  normalMissionMinutes: number;
  earlyMissionMinutes: number;
  totalMissionMinutes: number;
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
  employeeId: number | null;
  employeeName: string;
  clientId: number | null;
  clientName: string;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeRequestType = "leave" | "early_leave" | "mission" | "overtime" | "early_arrival";
export type EmployeeRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type EmployeeLeaveKind = "vacation" | "occasional_leave" | "resort_leave" | "sick_leave" | "urgent_leave" | "normal_leave";

export type EmployeeRequest = {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeTitle: string;
  requesterUserId: number;
  requesterName: string;
  type: EmployeeRequestType;
  leaveKind: EmployeeLeaveKind;
  dateFrom: string;
  dateTo: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  leavePaid: boolean | null;
  details: string;
  attachmentName: string;
  attachmentType: string;
  hasAttachment: boolean;
  status: EmployeeRequestStatus;
  assignedReviewerId: number | null;
  assignedReviewerName: string;
  reviewerNote: string;
  reviewedByUserId: number | null;
  reviewedByName: string;
  reviewedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type RequestReviewer = {
  id: number;
  displayName: string;
  roleLabel: string;
};

export type RequestsState = {
  requests: EmployeeRequest[];
  reviewers: RequestReviewer[];
  overtimeStartsAt: string;
  workdayStartsAt: string;
  overtimeApprovalAfter: string;
  earlyOvertimeMultiplier: number;
  urgentLeaveDeadline: string;
  urgentLeaveYearLimit: number;
  sickReportAfterDays: number;
  resortLeaveDays: number;
  resortNoticeDays: number;
  normalLeaveNoticeDays: number;
  employeeId: number | null;
  employeeName: string;
  isAdmin: boolean;
  userId: number;
  pendingCount: number;
};

export type ProductionWorkflowRole = "account_manager" | "production_manager" | "operation_manager" | "administrator" | "viewer";
export type ProductionWorkOrderStatus = "pending_production" | "pending_operations" | "final_approved";

export type ProductionClientOption = {
  id: number;
  name: string;
};

export type ProductionCatalogOption = {
  id: number;
  kind: "package" | "addon";
  name: string;
  price: number;
  inputs: string[];
  outputs: string[];
  appliesTo: string;
  bundleTotal: number | null;
};

export type ProductionOptionType = "photographer" | "videographer" | "model" | "blogger" | "location" | "studio" | "hair_stylist" | "makeup_stylist" | "stylist";

export type ProductionCostOption = {
  id: string;
  type: ProductionOptionType;
  name: string;
  price: number;
  billingMode: "included" | "extra";
};

export type ProductionWorkOrder = {
  id: number;
  code: string;
  documentType: "media_guide";
  clientId: number;
  clientName: string;
  bundleCatalogId: number;
  bundleName: string;
  bundlePrice: number;
  bundleInputs: string[];
  bundleOutputs: string[];
  addonCatalogId: number | null;
  addonName: string;
  addonPrice: number;
  addonInputs: string[];
  addonOutputs: string[];
  workDate: string;
  callTime: string;
  location: string;
  modelName: string;
  photographerName: string;
  accountNote: string;
  productionNote: string;
  operationNote: string;
  productionOptions: ProductionCostOption[];
  productionOptionsTotal: number;
  workOrderTotal: number;
  status: ProductionWorkOrderStatus;
  createdByUserId: number;
  createdByName: string;
  createdByRole: string;
  productionManagerUserId: number | null;
  productionManagerName: string;
  operationManagerUserId: number | null;
  operationManagerName: string;
  accountSubmittedAt: string;
  productionSubmittedAt: string;
  finalApprovedAt: string;
  draftInvoiceId: number | null;
  draftInvoiceCode: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductionState = {
  role: ProductionWorkflowRole;
  orders: ProductionWorkOrder[];
  clients: ProductionClientOption[];
  catalog: ProductionCatalogOption[];
  pendingProductionCount: number;
  pendingOperationsCount: number;
  finalApprovedCount: number;
};

export type DocumentDraft = {
  id?: number;
  generatedCode?: string;
  type: "invoice" | "quotation";
  companyKey: CompanyKey;
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
