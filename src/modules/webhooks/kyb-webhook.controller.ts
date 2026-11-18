import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { KybWebhookEventDto, WebhookAckDto } from './dto/kyb-webhook-event.dto.js';
import {
  KYB_SIGNATURE_HEADER,
  KybWebhookSignatureGuard,
} from './guards/kyb-webhook-signature.guard.js';
import { KybWebhookService } from './kyb-webhook.service.js';

@ApiTags('webhooks')
@Controller('webhooks')
export class KybWebhookController {
  constructor(private readonly webhooks: KybWebhookService) {}

  @Public()
  @Post('kyb')
  @UseGuards(KybWebhookSignatureGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'KYB provider callback',
    description:
      'Authenticated by HMAC signature instead of a JWT. Safe to retry: deliveries are de-duplicated by `eventId`, and results for stale review versions are ignored.',
  })
  @ApiHeader({
    name: KYB_SIGNATURE_HEADER,
    required: true,
    description: '`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`',
  })
  @ApiOkResponse({ type: WebhookAckDto })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or expired signature' })
  @ApiBadRequestResponse({ description: 'Authenticated but malformed payload' })
  async receive(@Body() event: KybWebhookEventDto): Promise<WebhookAckDto> {
    return { status: await this.webhooks.handle(event) };
  }
}
