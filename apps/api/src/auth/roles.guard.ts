import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../audit/audit.service.js';
import { ROLES_KEY } from './decorators.js';
import type { AuthUser, Role } from './auth.types.js';

/** Enforces @Roles(...) per endpoint — the 6-role matrix, server-side. Refusals are audited (8.1-e). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required || required.length === 0) return true;
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user || !required.includes(user.role)) {
      await this.audit.record(user?.userId, 'ROLE_REFUSED', `${req.method} ${req.route?.path ?? req.url}`);
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
