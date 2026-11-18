import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsISO4217CurrencyCode,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BusinessType } from '../enums/business-type.enum.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateApplicationDto {
  @ApiProperty({ example: 'Himalayan Coffee House' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  businessName: string;

  @ApiProperty({ example: 'Himalayan Coffee House Pvt. Ltd.' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalBusinessName: string;

  @ApiProperty({ enum: BusinessType, enumName: 'BusinessType' })
  @IsEnum(BusinessType)
  businessType: BusinessType;

  @ApiProperty({ example: 'TEST-123456789', description: 'Sensitive. Use test values only.' })
  @Transform(trim)
  @Matches(/^[A-Z0-9-]{5,32}$/, {
    message: 'taxId must be 5-32 uppercase letters, digits or dashes',
  })
  taxId: string;

  @ApiProperty({ example: 'Test Owner' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerFullName: string;

  @ApiProperty({ example: 'owner@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(255)
  ownerEmail: string;

  @ApiProperty({ example: '+9779800000000', description: 'E.164 format' })
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'ownerPhone must be in E.164 format' })
  ownerPhone: string;

  @ApiProperty({ example: '5814', description: 'ISO 18245 merchant category code' })
  @Matches(/^\d{4}$/, { message: 'mcc must be a 4-digit code' })
  mcc: string;

  @ApiProperty({ example: 250000, description: 'Expected monthly card volume' })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(999_999_999_999.99)
  expectedMonthlyVolume: number;

  @ApiProperty({ example: 850 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(9_999_999_999.99)
  averageTicketSize: number;

  @ApiProperty({ example: 'NPR', description: 'ISO 4217 currency code' })
  @IsISO4217CurrencyCode()
  currency: string;
}
