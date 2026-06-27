import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueuesService } from './queues.service';
import { AnalyticsProcessor } from './analytics.processor';
import { CleanupProcessor } from './cleanup.processor';

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
  ],
  providers: [QueuesService, AnalyticsProcessor, CleanupProcessor],
  exports: [BullModule, QueuesService],
})
export class QueuesModule {}
