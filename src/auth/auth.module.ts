import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ApiKey } from './entities/api-key.entity';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  controllers: [AuthController],
  providers: [AuthService, ApiKeyGuard],
  exports: [ApiKeyGuard, AuthService],
})
export class AuthModule {}
