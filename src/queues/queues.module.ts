import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuesService } from './queues.service';
import { AnalyticsProcessor } from './analytics.processor';
import { CleanupProcessor } from './cleanup.processor';
import { AnalyticsModule } from '../analytics/analytics.module';
import { Click } from '../analytics/entities/click.entity';
import { Link } from '../link/entities/link.entity';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('app.redis.host'),
          port: configService.get<number>('app.redis.port'),
          password: configService.get<string>('app.redis.password') || undefined,
          db: configService.get<number>('app.redis.db'),
        },
      }),
    }),
    BullModule.registerQueue({ name: 'analytics' }, { name: 'cleanup' }),
    TypeOrmModule.forFeature([Click, Link]),
    AnalyticsModule,
  ],
  providers: [QueuesService, AnalyticsProcessor, CleanupProcessor],
  exports: [BullModule, QueuesService],
})
export class QueuesModule {}
