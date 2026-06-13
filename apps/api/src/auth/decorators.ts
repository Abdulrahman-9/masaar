import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser, Role } from './auth.types.js';

export const ROLES_KEY = 'roles';
/** Restrict a handler to specific roles; enforced by RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const PUBLIC_KEY = 'isPublic';
/** Opt a route out of the global JWT guard (e.g. login). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Inject the authenticated user into a handler param. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
