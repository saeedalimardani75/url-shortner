import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export interface ClickEvent {
  linkId: number;
  ip?: string;
  userAgent?: string;
  referrer?: string;
  timestamp: string;
}

@Injectable()
export class QueuesService implements OnModuleInit {
  private readonly logger = new Logger(QueuesService.name);

  constructor(
    @InjectQueue('analytics') private readonly analyticsQueue: Queue,
    @InjectQueue('cleanup') private readonly cleanupQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.scheduleCleanup();
  }

  async addClickEvent(event: ClickEvent): Promise<void> {
    await this.analyticsQueue.add('record-click', event, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 100,
    });
  }

  async scheduleCleanup(): Promise<void> {
    const jobs = await this.cleanupQueue.getRepeatableJobs();
    const existingJob = jobs.find((j) => j.name === 'expired-links-cleanup');
    if (!existingJob) {
      await this.cleanupQueue.add(
        'cleanup-expired',
        {},
        {
          repeat: { cron: '0 */6 * * *' },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      this.logger.log('Scheduled expired links cleanup every 6 hours');
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.analyticsQueue.isReady();
      return true;
    } catch {
      return false;
    }
  }
}
