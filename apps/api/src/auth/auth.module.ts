import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-only-secret',
        signOptions: { expiresIn: config.get<string>('JWT_TTL') ?? '8h' },
      }),
    }),
  ],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
