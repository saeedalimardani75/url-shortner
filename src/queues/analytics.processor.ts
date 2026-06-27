import { Processor, Process, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Click } from '../analytics/entities/click.entity';

export interface ClickJobData {
  linkId: number;
  ip?: string;
  userAgent?: string;
  referrer?: string;
  timestamp: string;
}

@Processor('analytics')
export class AnalyticsProcessor {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(
    @InjectRepository(Click)
    private readonly clickRepository: Repository<Click>,
  ) {}

  @Process('record-click')
  async processClick(job: Job<ClickJobData>): Promise<void> {
    const { linkId, ip, userAgent, referrer, timestamp } = job.data;

    const click = this.clickRepository.create({
      linkId,
      ip,
      userAgent,
      referrer,
      clickedAt: new Date(timestamp),
    });

    await this.clickRepository.save(click);
    this.logger.debug(`Recorded click for link ${linkId}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.debug(`Analytics job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Analytics job ${job.id} failed: ${error.message}`);
  }
}
