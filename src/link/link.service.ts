import {
  Injectable,
  NotFoundException,
  ConflictException,
  GoneException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { nanoid } from 'nanoid';
import { Link } from './entities/link.entity';
import { CreateLinkDto } from './dto/create-link.dto';
import { AnalyticsService } from '../analytics/analytics.service';
import { RedisService } from '../redis/redis.service';
import { QueuesService } from '../queues/queues.service';
import { RedisKeys } from '../redis/redis-keys';
import { LINK_CONFIG } from './link.config';

@Injectable()
export class LinkService {
  private readonly logger = new Logger(LinkService.name);

  constructor(
    @InjectRepository(Link)
    private readonly linkRepository: Repository<Link>,
    private readonly analyticsService: AnalyticsService,
    private readonly redisService: RedisService,
    private readonly queuesService: QueuesService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creates a short link. Database insert runs in a transaction; Redis cache is
   * updated after commit (eventual consistency — a cache write failure does not
   * roll back the persisted link).
   */
  async create(dto: CreateLinkDto, requestId?: string): Promise<Link> {
    const startTime = Date.now();
    const normalizedUrl = this.normalizeUrl(dto.originalUrl);
    const logContext = { requestId, originalUrl: normalizedUrl };

    if (dto.customCode) {
      await this.validateCustomCode(dto.customCode);
      return this.persistLink(
        normalizedUrl,
        dto.customCode,
        dto.expiresAt,
        logContext,
        startTime,
      );
    }

    for (let attempt = 0; attempt < LINK_CONFIG.maxShortCodeRetries; attempt++) {
      const shortCode = nanoid(LINK_CONFIG.defaultShortCodeLength);
      try {
        return await this.persistLink(
          normalizedUrl,
          shortCode,
          dto.expiresAt,
          logContext,
          startTime,
        );
      } catch (error) {
        if (this.isUniqueConstraintViolation(error)) {
          this.logger.debug({
            message: 'Short code collision on insert, retrying',
            ...logContext,
            shortCode,
            attempt: attempt + 1,
          });
          continue;
        }
        this.logger.error({
          message: 'Failed to create short link',
          ...logContext,
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    this.logger.error({
      message: 'Exhausted short code generation retries',
      ...logContext,
      durationMs: Date.now() - startTime,
    });
    throw new ConflictException('Unable to generate unique short code after retries');
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hostname = parsed.hostname.toLowerCase();
      if (parsed.pathname === '/') {
        parsed.pathname = '';
      }
      return parsed.toString();
    } catch {
      throw new BadRequestException('Invalid URL');
    }
  }

  private async validateCustomCode(customCode: string): Promise<void> {
    const lowerCode = customCode.toLowerCase();
    if (LINK_CONFIG.reservedCodes.includes(lowerCode as (typeof LINK_CONFIG.reservedCodes)[number])) {
      throw new BadRequestException(`Custom code "${customCode}" is reserved`);
    }
    const existing = await this.linkRepository.findOne({
      where: { shortCode: customCode },
    });
    if (existing) {
      throw new ConflictException('Custom code is already in use');
    }
  }

  private async persistLink(
    originalUrl: string,
    shortCode: string,
    expiresAt: string | undefined,
    logContext: Record<string, unknown>,
    startTime: number,
  ): Promise<Link> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const link = queryRunner.manager.create(Link, {
        originalUrl,
        shortCode,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });

      const saved = await queryRunner.manager.save(link);
      await queryRunner.commitTransaction();

      await this.cacheLink(shortCode, saved);

      this.logger.log({
        message: 'Created short link',
        ...logContext,
        shortCode,
        durationMs: Date.now() - startTime,
      });

      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === '23505' || error.code === 'ER_DUP_ENTRY')
    );
  }

  async findByShortCode(shortCode: string, requestId?: string): Promise<Link> {
    const startTime = Date.now();
    const logContext = { shortCode, requestId };

    const cached = await this.getCachedLink(shortCode);
    if (cached) {
      this.logger.debug({
        message: 'Cache hit for link',
        ...logContext,
        durationMs: Date.now() - startTime,
        cacheHit: true,
      });
      return this.validateLink(cached);
    }

    this.logger.debug({
      message: 'Cache miss for link, loading from database',
      ...logContext,
      cacheHit: false,
    });

    const link = await this.redisService.getOrSet(
      RedisKeys.link(shortCode),
      () => this.getDatabaseLink(shortCode),
      LINK_CONFIG.cacheTtlSeconds,
    );

    this.logger.debug({
      message: 'Link loaded from database',
      ...logContext,
      durationMs: Date.now() - startTime,
      cacheHit: false,
    });

    return link;
  }

  private async getCachedLink(shortCode: string): Promise<Link | null> {
    return this.redisService.get<Link>(RedisKeys.link(shortCode));
  }

  private async getDatabaseLink(shortCode: string): Promise<Link> {
    const link = await this.linkRepository.findOne({ where: { shortCode } });

    if (!link) {
      throw new NotFoundException('Short URL not found');
    }
    if (link.deletedAt) {
      throw new GoneException('This short URL has been deleted');
    }
    if (!link.isActive) {
      throw new GoneException('This short URL has been disabled');
    }
    if (link.expiresAt && new Date() > link.expiresAt) {
      throw new GoneException('This short URL has expired');
    }

    return link;
  }

  private validateLink(link: Link): Link {
    if (!link.isActive) {
      throw new GoneException('This short URL has been disabled');
    }
    if (link.expiresAt && new Date() > link.expiresAt) {
      throw new GoneException('This short URL has expired');
    }
    return link;
  }

  private async cacheLink(shortCode: string, link: Link): Promise<void> {
    try {
      await this.redisService.set(RedisKeys.link(shortCode), link, LINK_CONFIG.cacheTtlSeconds);
    } catch (error) {
      this.logger.warn({
        message: 'Failed to update link cache',
        shortCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Resolves a redirect target and records the click. Analytics enqueue and cache
   * refresh are best-effort; only the atomic DB increment is required for counts.
   */
  async resolveAndTrack(
    shortCode: string,
    ip?: string,
    userAgent?: string,
    referrer?: string,
    requestId?: string,
  ): Promise<Link> {
    const startTime = Date.now();
    const logContext = { shortCode, requestId };

    const link = await this.findByShortCode(shortCode, requestId);

    const hashedIp = ip ? this.hashIp(ip) : undefined;

    try {
      await this.queuesService.addClickEvent({
        linkId: link.id,
        ip: hashedIp,
        userAgent,
        referrer,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn({
        message: 'Failed to enqueue click event',
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      await this.incrementClickCount(link.id);
    } catch (error) {
      this.logger.error({
        message: 'Failed to increment click count',
        ...logContext,
        linkId: link.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    try {
      const updatedLink = await this.getDatabaseLink(shortCode);
      await this.cacheLink(shortCode, updatedLink);

      this.logger.log({
        message: 'Resolved and tracked link',
        ...logContext,
        durationMs: Date.now() - startTime,
        clickCount: updatedLink.clickCount,
      });

      return updatedLink;
    } catch (error) {
      this.logger.warn({
        message: 'Failed to refresh link cache after click',
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });

      this.logger.log({
        message: 'Resolved and tracked link',
        ...logContext,
        durationMs: Date.now() - startTime,
        clickCount: link.clickCount + LINK_CONFIG.clickCounterIncrement,
      });

      return { ...link, clickCount: link.clickCount + LINK_CONFIG.clickCounterIncrement };
    }
  }

  private async incrementClickCount(linkId: number): Promise<void> {
    await this.linkRepository.increment(
      { id: linkId },
      'clickCount',
      LINK_CONFIG.clickCounterIncrement,
    );
  }

  async getStats(shortCode: string, requestId?: string) {
    const startTime = Date.now();
    const link = await this.findByShortCode(shortCode, requestId);
    const totalClicks = await this.analyticsService.getClickCount(link.id);
    const clicksByDate = await this.analyticsService.getClicksGroupedByDate(link.id);

    this.logger.debug({
      message: 'Retrieved link stats',
      shortCode,
      requestId,
      durationMs: Date.now() - startTime,
    });

    return {
      shortCode: link.shortCode,
      originalUrl: link.originalUrl,
      totalClicks,
      clicksByDate,
    };
  }

  /**
   * Offset-based pagination. Suitable for admin dashboards with moderate dataset
   * sizes. For high-volume public listing at scale, cursor pagination keyed on
   * (createdAt, id) would avoid skip/limit degradation — not changed here to
   * preserve the existing API contract.
   */
  async findAllPaginated(
    page = 1,
    limit = 20,
  ): Promise<{ items: Link[]; total: number; page: number; limit: number; totalPages: number }> {
    const [items, total] = await this.linkRepository.findAndCount({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAll(): Promise<Link[]> {
    return this.linkRepository.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Link> {
    const link = await this.linkRepository.findOne({ where: { id } });
    if (!link) {
      throw new NotFoundException(`Link with id ${id} not found`);
    }
    return link;
  }

  async softDelete(id: number): Promise<void> {
    const link = await this.findOne(id);
    link.deletedAt = new Date();
    link.isActive = false;
    await this.linkRepository.save(link);
    await this.redisService.del(RedisKeys.link(link.shortCode));
    this.logger.log({ message: 'Soft deleted link', linkId: id, shortCode: link.shortCode });
  }

  async restore(id: number): Promise<void> {
    const link = await this.findOne(id);
    if (!link.deletedAt) {
      throw new BadRequestException('Link is not deleted');
    }
    link.deletedAt = undefined;
    link.isActive = true;
    await this.linkRepository.save(link);
    await this.redisService.del(RedisKeys.link(link.shortCode));
    this.logger.log({ message: 'Restored link', linkId: id, shortCode: link.shortCode });
  }

  async toggleActive(id: number, isActive: boolean): Promise<void> {
    const link = await this.findOne(id);
    if (link.deletedAt) {
      throw new BadRequestException('Cannot modify a deleted link');
    }
    link.isActive = isActive;
    await this.linkRepository.save(link);
    await this.redisService.del(RedisKeys.link(link.shortCode));
    this.logger.log({
      message: `${isActive ? 'Enabled' : 'Disabled'} link`,
      linkId: id,
      shortCode: link.shortCode,
    });
  }

  async hardDelete(id: number): Promise<void> {
    const link = await this.findOne(id);
    await this.linkRepository.remove(link);
    await this.redisService.del(RedisKeys.link(link.shortCode));
    this.logger.log({ message: 'Hard deleted link', linkId: id, shortCode: link.shortCode });
  }

  async countActive(): Promise<number> {
    return this.linkRepository.count({
      where: { isActive: true, deletedAt: IsNull() },
    });
  }

  getFullShortUrl(shortCode: string, baseUrl: string): string {
    return `${baseUrl}/${shortCode}`;
  }

  private hashIp(ip: string): string {
    return createHash('sha256').update(ip).digest('hex').slice(0, 16);
  }
}
