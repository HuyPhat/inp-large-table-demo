import 'reflect-metadata';
import {
  Controller,
  DefaultValuePipe,
  Get,
  Module,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

const TOTAL = 20_000;
const MAX_PAGE_SIZE = 1000;

const pick = <T>(list: T[], n: number) => list[n % list.length];
const REGIONS = ['APAC', 'EMEA', 'LATAM', 'NA'];
const STATUSES = ['paid', 'pending', 'failed', 'refunded'];
const CURRENCIES = ['USD', 'EUR', 'JPY', 'VND'];
const CHANNELS = ['web', 'mobile', 'partner', 'store'];
const PEOPLE = ['An', 'Binh', 'Chi', 'Dung', 'Giang', 'Hoa', 'Khanh', 'Linh'];
const PRODUCTS = ['Keyboard', 'Monitor', 'Dock', 'Headset', 'Webcam', 'Mouse'];
const COMPANIES = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Vehement'];

// Deterministic so that every measurement runs against the same data.
const rows = Array.from({ length: TOTAL }, (_, i) => {
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
    note: `Order ${i + 1} for ${company}`,
  };
});

@Controller('rows')
class RowsController {
  @Get()
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(100), ParseIntPipe) pageSize: number,
  ) {
    const size = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
    const start = (Math.max(page, 1) - 1) * size;
    return { items: rows.slice(start, start + size), total: TOTAL };
  }
}

@Module({ controllers: [RowsController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: 'http://localhost:3000' });
  await app.listen(3001);
}

void bootstrap();
