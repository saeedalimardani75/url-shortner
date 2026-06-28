import { Processor, Process, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { Link } from '../link/entities/link.entity';
import { RedisService } from '../redis/redis.service';

@Processor('cleanup')
export class CleanupProcessor {
  private readonly logger = new Logger(CleanupProcessor.name);

  constructor(
    @InjectRepository(Link)
    private readonly linkRepository: Repository<Link>,
    private readonly redisService: RedisService,
  ) {}

  @Process({ name: 'cleanup-expired', concurrency: 2 })
  async cleanupExpiredLinks(_job: Job): Promise<void> {
    const expiredLinks = await this.linkRepository.find({
      where: {
        expiresAt: LessThan(new Date()),
        isActive: true,
        deletedAt: IsNull(),
      },
      take: 1000,
    });

    let deactivated = 0;
    let failed = 0;

    for (const link of expiredLinks) {
      try {
        await this.linkRepository.update(link.id, { isActive: false });
        await this.redisService.del(`link:${link.shortCode}`);
        this.logger.log(`Deactivated expired link: ${link.shortCode}`);
        deactivated++;
      } catch (error) {
        this.logger.error({
          message: 'Failed to deactivate expired link',
          shortCode: link.shortCode,
          linkId: link.id,
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }
    }

    this.logger.log({
      message: 'Cleanup complete',
      total: expiredLinks.length,
      deactivated,
      failed,
    });
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.debug(`Cleanup job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Cleanup job ${job.id} failed: ${error.message}`);
  }
}
