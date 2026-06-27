import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { LinkModule } from '../link/link.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [LinkModule, AuthModule],
  controllers: [AdminController],
})
export class AdminModule {}
