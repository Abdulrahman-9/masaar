import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Append-only audit (8.1-e). Every mutation — and every refused attempt — is recorded. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(userId: string | undefined, action: string, target: string, ip?: string): Promise<void> {
    await this.prisma.auditLog.create({ data: { userId: userId ?? null, action, target, ip: ip ?? null } });
  }
}
