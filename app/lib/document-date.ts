const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function isValidDate(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

export function formatDocumentDate(value: string) {
  const normalized = value.trim().slice(0, 10);
  const match = ISO_DATE.exec(normalized);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function parseDocumentDate(value: string) {
  const match = DISPLAY_DATE.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  if (!isValidDate(Number(year), Number(month), Number(day))) return null;
  return `${year}-${month}-${day}`;
}

export function maskDocumentDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
