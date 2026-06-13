import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@masaar/db';

/** Nest-managed wrapper around the shared Prisma client. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
