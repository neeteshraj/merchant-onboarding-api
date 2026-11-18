import { PartialType } from '@nestjs/swagger';
import { CreateApplicationDto } from './create-application.dto.js';

/** Any subset of the business fields. Status, ownership and risk fields are never client-writable. */
export class UpdateApplicationDto extends PartialType(CreateApplicationDto) {}
