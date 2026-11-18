import { Module } from '@nestjs/common';
import { RiskModule } from '../risk/risk.module.js';
import { KybWebhookSignatureGuard } from './guards/kyb-webhook-signature.guard.js';
import { KybWebhookController } from './kyb-webhook.controller.js';
import { KybWebhookService } from './kyb-webhook.service.js';
import { KybWebhookServiceImpl } from './kyb-webhook.service.impl.js';
import { TypeOrmWebhookEventRepository } from './repositories/typeorm-webhook-event.repository.js';
import { WebhookEventRepository } from './repositories/webhook-event.repository.js';
import { HmacWebhookSignatureVerifier } from './signature/hmac-webhook-signature-verifier.js';
import { WebhookSignatureVerifier } from './signature/webhook-signature-verifier.js';

@Module({
  imports: [RiskModule],
  controllers: [KybWebhookController],
  providers: [
    KybWebhookSignatureGuard,
    { provide: KybWebhookService, useClass: KybWebhookServiceImpl },
    { provide: WebhookEventRepository, useClass: TypeOrmWebhookEventRepository },
    { provide: WebhookSignatureVerifier, useClass: HmacWebhookSignatureVerifier },
  ],
})
export class WebhooksModule {}
