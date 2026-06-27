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

  @Process('cleanup-expired')
  async cleanupExpiredLinks(_job: Job): Promise<void> {
    const expiredLinks = await this.linkRepository.find({
      where: {
        expiresAt: LessThan(new Date()),
        isActive: true,
        deletedAt: IsNull(),
      },
    });

    for (const link of expiredLinks) {
      link.isActive = false;
      await this.linkRepository.save(link);
      await this.redisService.del(`link:${link.shortCode}`);
      this.logger.log(`Deactivated expired link: ${link.shortCode}`);
    }

    this.logger.log(`Cleanup complete: ${expiredLinks.length} links deactivated`);
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
