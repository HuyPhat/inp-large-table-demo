// Copy of the columns and formatters in apps/web (the two apps share no code).

export type Row = Record<string, string | number> & { id: number; currency: string };
type Kind = 'id' | 'text' | 'status' | 'money' | 'percent' | 'date' | 'number';
export type Column = { key: string; label: string; kind: Kind };

export const COLUMNS: Column[] = [
  { key: 'id', label: 'ID', kind: 'id' },
  { key: 'sku', label: 'SKU', kind: 'text' },
  { key: 'product', label: 'Product', kind: 'text' },
  { key: 'customer', label: 'Customer', kind: 'text' },
  { key: 'email', label: 'Email', kind: 'text' },
  { key: 'region', label: 'Region', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'status' },
  { key: 'owner', label: 'Owner', kind: 'text' },
  { key: 'channel', label: 'Channel', kind: 'text' },
  { key: 'warehouse', label: 'Warehouse', kind: 'text' },
  { key: 'qty', label: 'Qty', kind: 'number' },
  { key: 'unitPrice', label: 'Unit price', kind: 'money' },
  { key: 'discount', label: 'Discount', kind: 'percent' },
  { key: 'tax', label: 'Tax', kind: 'percent' },
  { key: 'total', label: 'Total', kind: 'money' },
  { key: 'margin', label: 'Margin', kind: 'percent' },
  { key: 'createdAt', label: 'Created', kind: 'date' },
  { key: 'updatedAt', label: 'Updated', kind: 'date' },
  { key: 'note', label: 'Note', kind: 'text' },
];

const LOCALE = 'en-US';
const makeMoney = (currency: string) =>
  new Intl.NumberFormat(LOCALE, { style: 'currency', currency });
const makePercent = () => new Intl.NumberFormat(LOCALE, { style: 'percent' });
const makeDate = () =>
  new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** The naive way: a new Intl formatter for every cell on every render. */
export function formatPerCell(row: Row, column: Column): string {
  const value = row[column.key];
  if (column.kind === 'money') return makeMoney(row.currency).format(Number(value));
  if (column.kind === 'percent') return makePercent().format(Number(value));
  if (column.kind === 'date') return makeDate().format(new Date(value));
  return String(value);
}
