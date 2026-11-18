import { ApiProperty } from '@nestjs/swagger';

export class AccessTokenDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ description: 'Token lifetime in seconds', example: 3600 })
  expiresIn: number;
}
