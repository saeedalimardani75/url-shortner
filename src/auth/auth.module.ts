import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { ApiKey } from './entities/api-key.entity';
import { ApiKeyGuard } from './guards/api-key.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  providers: [AuthService, ApiKeyGuard, RolesGuard],
  exports: [AuthService, ApiKeyGuard, RolesGuard],
})
export class AuthModule {}
