import { Processor, Process, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Click } from '../analytics/entities/click.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { ANALYTICS_CONFIG } from '../analytics/analytics.config';

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
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Process('record-click')
  async processClick(job: Job<ClickJobData>): Promise<void> {
    const startTime = Date.now();
    const { linkId, ip, userAgent, referrer, timestamp } = job.data;

    const click = this.clickRepository.create({
      linkId,
      ip,
      userAgent: this.truncate(userAgent, ANALYTICS_CONFIG.maxUserAgentLength),
      referrer: this.truncate(referrer, ANALYTICS_CONFIG.maxReferrerLength),
      clickedAt: new Date(timestamp),
    });

    await this.clickRepository.save(click);
    await this.analyticsService.invalidateCache(linkId);

    this.logger.log({
      message: 'Recorded click',
      linkId,
      jobId: job.id,
      durationMs: Date.now() - startTime,
    });
  }

  private truncate(value: string | undefined, maxLength: number): string | undefined {
    if (!value) {
      return undefined;
    }
    return value.length > maxLength ? value.slice(0, maxLength) : value;
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.debug({ message: 'Analytics job completed', jobId: job.id });
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error({
      message: 'Analytics job failed',
      jobId: job.id,
      linkId: job.data?.linkId,
      error: error.message,
    });
  }
}
