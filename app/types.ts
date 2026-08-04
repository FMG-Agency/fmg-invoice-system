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
