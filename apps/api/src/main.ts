import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['warn', 'error', 'log'] });

  // security headers (CSP, HSTS, etc.) — the gap flagged in the security review
  app.use(helmet());
  // signed httpOnly session cookies (not localStorage)
  app.use(cookieParser());

  app.setGlobalPrefix('api');
  // reject unknown/extra fields and coerce DTO types — server-side input validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim());
  app.enableCors({ origin: origins, credentials: true });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  console.log(`Masaar API on http://localhost:${port}/api  (auth: ${process.env.AUTH_MODE ?? 'mock'})`);
}

void bootstrap();
