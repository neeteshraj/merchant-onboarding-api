import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigService } from '../../config/app-config.service.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthServiceImpl } from './auth.service.impl.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PasswordHasher } from './password/password-hasher.js';
import { ScryptPasswordHasher } from './password/scrypt-password-hasher.js';
import { JwtTokenService } from './tokens/jwt-token.service.js';
import { TokenService } from './tokens/token.service.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN_SECONDS'), algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: AuthService, useClass: AuthServiceImpl },
    { provide: PasswordHasher, useClass: ScryptPasswordHasher },
    { provide: TokenService, useClass: JwtTokenService },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
