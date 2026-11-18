import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';

/** Injects the authenticated user resolved by {@link JwtAuthGuard}. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const { user } = ctx.switchToHttp().getRequest<Request>();
    if (!user) throw new UnauthorizedException();
    return user;
  },
);
