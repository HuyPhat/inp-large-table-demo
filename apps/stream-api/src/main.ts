import 'reflect-metadata';
import {
  Controller,
  DefaultValuePipe,
  Get,
  Module,
  ParseIntPipe,
  Query,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Observable } from 'rxjs';
import { makeGenerator } from './data';

const MAX_RATE = 20_000;
const TICK_MS = 10;

@Controller()
class StreamController {
  @Get('health')
  health() {
    return { ok: true };
  }

  /**
   * Emits `rate` messages per second. The number due is computed from elapsed
   * time rather than counted per tick, so a late timer produces a burst
   * instead of a permanently lower rate.
   */
  @Sse('stream')
  stream(
    @Query('rate', new DefaultValuePipe(1000), ParseIntPipe) rate: number,
    @Query('seed', new DefaultValuePipe(1), ParseIntPipe) seed: number,
  ): Observable<MessageEvent> {
    const perSecond = Math.min(Math.max(rate, 0), MAX_RATE);
    return new Observable<MessageEvent>((subscriber) => {
      const next = makeGenerator(seed);
      const start = performance.now();
      let sent = 0;
      const timer = setInterval(() => {
        const due = Math.floor(((performance.now() - start) / 1000) * perSecond);
        for (; sent < due; sent++) {
          subscriber.next({ data: { ...next(), sentAt: Date.now() } });
        }
      }, TICK_MS);
      return () => clearInterval(timer);
    });
  }
}

@Module({ controllers: [StreamController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: 'http://localhost:5173' });
  await app.listen(3002);
}

void bootstrap();
