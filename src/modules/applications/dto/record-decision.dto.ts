import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ReviewDecision } from '../enums/review-decision.enum.js';

export class RecordDecisionDto {
  @ApiProperty({ enum: ReviewDecision, enumName: 'ReviewDecision' })
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;

  @ApiPropertyOptional({ description: 'Required when rejecting or requesting information' })
  @ValidateIf(
    (dto: RecordDecisionDto) => dto.decision !== ReviewDecision.Approve || dto.reason !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason?: string;
}
