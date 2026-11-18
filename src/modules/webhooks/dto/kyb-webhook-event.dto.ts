import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { RiskLevel } from '../../risk/enums/risk.enum.js';
import { KybWebhookEventType } from '../enums/kyb-webhook-event-type.enum.js';

export class KybCheckResultDto {
  @ApiProperty({ description: 'Provider-side reference for the check', example: 'sim_4f2a9c' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  reference: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  score: number;

  @ApiProperty({ enum: RiskLevel, enumName: 'RiskLevel' })
  @IsEnum(RiskLevel)
  level: RiskLevel;

  @ApiProperty({ type: [String], example: ['HIGH_RISK_MCC'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  reasons: string[];
}

/** Callback sent by the KYB provider when an asynchronous check settles. */
export class KybWebhookEventDto {
  @ApiProperty({
    description: 'Unique per delivery; used for de-duplication',
    example: 'evt_01J9ZK3Q7A',
  })
  @Matches(/^[A-Za-z0-9_-]{8,128}$/, { message: 'eventId must be 8-128 URL-safe characters' })
  eventId: string;

  @ApiProperty({ enum: KybWebhookEventType, enumName: 'KybWebhookEventType' })
  @IsEnum(KybWebhookEventType)
  type: KybWebhookEventType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  applicationId: string;

  @ApiProperty({ minimum: 1, description: 'Risk review version the check was requested for' })
  @IsInt()
  @Min(1)
  reviewVersion: number;

  @ApiPropertyOptional({
    type: KybCheckResultDto,
    description: `Required for ${KybWebhookEventType.CheckCompleted}`,
  })
  @ValidateIf((event: KybWebhookEventDto) => event.type === KybWebhookEventType.CheckCompleted)
  @IsDefined()
  @ValidateNested()
  @Type(() => KybCheckResultDto)
  result?: KybCheckResultDto;

  @ApiPropertyOptional({ description: `Required for ${KybWebhookEventType.CheckFailed}` })
  @ValidateIf((event: KybWebhookEventDto) => event.type === KybWebhookEventType.CheckFailed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  failureReason?: string;
}

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored';

export class WebhookAckDto {
  @ApiProperty({
    enum: ['processed', 'duplicate', 'ignored'],
    description:
      '`processed`: state changed. `duplicate`: event id already handled. `ignored`: review was stale or already settled.',
  })
  status: WebhookOutcome;
}
