import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

/**
 * Shared Prisma client singleton — reused across the API process and avoids
 * exhausting connections during dev hot-reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
