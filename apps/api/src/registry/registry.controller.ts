import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Roles } from '../auth/decorators.js';

/** Read-only registries surfaced to the admin dashboard. */
@Controller()
export class RegistryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('vendors')
  @Roles('SUPER_ADMIN', 'ROC_ADMIN', 'EVALUATION', 'AUDITOR')
  vendors() {
    return this.prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  }

  @Get('contracts')
  @Roles('SUPER_ADMIN', 'ROC_ADMIN', 'AUDITOR')
  contracts() {
    return this.prisma.contract.findMany({
      include: { guarantees: true, vos: true, extensions: true, lds: true, tender: { select: { titleAr: true, titleEn: true } } },
      orderBy: { signedOn: 'desc' },
    });
  }
}
