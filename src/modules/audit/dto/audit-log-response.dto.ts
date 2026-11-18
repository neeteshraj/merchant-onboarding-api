import { ApiProperty } from '@nestjs/swagger';
import type { AuditLog } from '../entities/audit-log.entity.js';
import { AuditAction } from '../enums/audit-action.enum.js';

export class AuditLogResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'null for system actions',
  })
  actorId: string | null;

  @ApiProperty({ enum: AuditAction, enumName: 'AuditAction' })
  action: AuditAction;

  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata: Record<string, unknown>;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(entity: AuditLog): AuditLogResponseDto {
    return {
      id: entity.id,
      actorId: entity.actorId,
      action: entity.action,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
    };
  }
}
