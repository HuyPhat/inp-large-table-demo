// Deterministic data and message generation. Same seed gives the same
// sequence, so every measurement and every correctness check is repeatable.
// (The row generator is a copy of apps/api on purpose: the two apps share no code.)

export const LOADED = 1000; // rows the client loads and the stream patches

const pick = <T>(list: T[], n: number) => list[n % list.length];
const REGIONS = ['APAC', 'EMEA', 'LATAM', 'NA'];
export const STATUSES = ['paid', 'pending', 'failed', 'refunded'];
const CURRENCIES = ['USD', 'EUR', 'JPY', 'VND'];
const CHANNELS = ['web', 'mobile', 'partner', 'store'];
const PEOPLE = ['An', 'Binh', 'Chi', 'Dung', 'Giang', 'Hoa', 'Khanh', 'Linh'];
const PRODUCTS = ['Keyboard', 'Monitor', 'Dock', 'Headset', 'Webcam', 'Mouse'];
const COMPANIES = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Vehement'];

export type Row = ReturnType<typeof makeRow>;

function makeRow(i: number) {
  const qty = (i % 40) + 1;
  const unitPrice = 10 + ((i * 37) % 900);
  const discount = (i % 25) / 100;
  const tax = 0.1;
  const company = pick(COMPANIES, i * 7);
  const created = Date.UTC(2026, 0, 1) + i * 3_600_000;
  return {
    id: i + 1,
    sku: `SKU-${String((i * 13) % 100000).padStart(5, '0')}`,
    product: pick(PRODUCTS, i),
    customer: `${company} ${(i % 90) + 10}`,
    email: `ops${i}@${company.toLowerCase()}.example`,
    region: pick(REGIONS, i * 3),
    status: pick(STATUSES, i * 5),
    owner: pick(PEOPLE, i * 11),
    channel: pick(CHANNELS, i * 2),
    currency: pick(CURRENCIES, i),
    warehouse: `WH-${(i % 12) + 1}`,
    qty,
    unitPrice,
    discount,
    tax,
    total: qty * unitPrice * (1 - discount) * (1 + tax),
    margin: ((i * 17) % 60) / 100,
    createdAt: new Date(created).toISOString(),
    updatedAt: new Date(created + 86_400_000).toISOString(),
    note: `Order ${i + 1}`,
  };
}

export const rows: Row[] = Array.from({ length: LOADED }, (_, i) => makeRow(i));

export type Patch = Pick<Row, 'status' | 'qty' | 'total' | 'updatedAt'>;
export type Message = { seq: number; id: number; patch: Patch };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UPDATE_BASE = Date.UTC(2026, 6, 1);

/** Returns a function that yields message 1, 2, 3, ... for the given seed. */
export function makeGenerator(seed: number) {
  const rand = mulberry32(seed);
  let seq = 0;
  return (): Message => {
    seq += 1;
    const row = rows[Math.floor(rand() * LOADED)];
    const qty = 1 + Math.floor(rand() * 40);
    const status = STATUSES[Math.floor(rand() * STATUSES.length)];
    return {
      seq,
      id: row.id,
      patch: {
        status,
        qty,
        total: qty * row.unitPrice * (1 - row.discount) * (1 + row.tax),
        updatedAt: new Date(UPDATE_BASE + seq * 1000).toISOString(),
      },
    };
  };
}
