import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'sales.one@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
