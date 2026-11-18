import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  type RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { WebhookSignatureVerifier } from '../signature/webhook-signature-verifier.js';

export const KYB_SIGNATURE_HEADER = 'x-kyb-signature';

/**
 * Rejects callbacks whose signature does not match the raw body. Runs before
 * validation, so unauthenticated callers learn nothing about the payload schema.
 * Requires the app to be created with `rawBody: true`.
 */
@Injectable()
export class KybWebhookSignatureGuard implements CanActivate {
  constructor(private readonly verifier: WebhookSignatureVerifier) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const { rawBody } = request;
    if (!rawBody || !this.verifier.verify(rawBody, request.header(KYB_SIGNATURE_HEADER))) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    return true;
  }
}
