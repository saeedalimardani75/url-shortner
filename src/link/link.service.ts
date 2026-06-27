import {
  Injectable,
  NotFoundException,
  ConflictException,
  GoneException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { nanoid } from 'nanoid';
import { Link } from './entities/link.entity';
import { CreateLinkDto } from './dto/create-link.dto';
import { AnalyticsService } from '../analytics/analytics.service';
import { RedisService } from '../redis/redis.service';
import { QueuesService } from '../queues/queues.service';

const RESERVED_CODES = ['links', 'stats', 'docs', 'api', 'auth', 'shorten', 'health', 'metrics', 'admin'];
const LINK_CACHE_TTL = 600;

@Injectable()
export class LinkService {
  private readonly logger = new Logger(LinkService.name);

  constructor(
    @InjectRepository(Link)
    private readonly linkRepository: Repository<Link>,
    private readonly analyticsService: AnalyticsService,
    private readonly redisService: RedisService,
    private readonly queuesService: QueuesService,
  ) {}

  async create(dto: CreateLinkDto): Promise<Link> {
    const shortCode = dto.customCode || nanoid(8);

    if (dto.customCode) {
      if (RESERVED_CODES.includes(dto.customCode.toLowerCase())) {
        throw new BadRequestException(`Custom code "${dto.customCode}" is reserved`);
      }
      const existing = await this.linkRepository.findOne({
        where: { shortCode: dto.customCode },
      });
      if (existing) {
        throw new ConflictException('Custom code is already in use');
      }
    }

    const link = this.linkRepository.create({
      originalUrl: dto.originalUrl,
      shortCode,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });

    const saved = await this.linkRepository.save(link);
    this.logger.log(`Created short link: ${shortCode} -> ${dto.originalUrl}`);

    await this.redisService.set(`link:${shortCode}`, saved, LINK_CACHE_TTL);

    return saved;
  }

  async findByShortCode(shortCode: string): Promise<Link> {
    const cached = await this.redisService.get<Link>(`link:${shortCode}`);
    if (cached) {
      if (!cached.isActive) {
        throw new GoneException('This short URL has been disabled');
      }
      if (cached.expiresAt && new Date() > new Date(cached.expiresAt)) {
        throw new GoneException('This short URL has expired');
      }
      return cached;
    }

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

    await this.redisService.set(`link:${shortCode}`, link, LINK_CACHE_TTL);

    return link;
  }

  async resolveAndTrack(shortCode: string, ip?: string, userAgent?: string, referrer?: string): Promise<Link> {
    const link = await this.findByShortCode(shortCode);

    await this.queuesService.addClickEvent({
      linkId: link.id,
      ip,
      userAgent,
      referrer,
      timestamp: new Date().toISOString(),
    });

    link.clickCount += 1;
    const saved = await this.linkRepository.save(link);

    await this.redisService.set(`link:${shortCode}`, saved, LINK_CACHE_TTL);

    return saved;
  }

  async getStats(shortCode: string) {
    const link = await this.findByShortCode(shortCode);
    const totalClicks = await this.analyticsService.getClickCount(link.id);
    const clicksByDate = await this.analyticsService.getClicksGroupedByDate(link.id);

    return {
      shortCode: link.shortCode,
      originalUrl: link.originalUrl,
      totalClicks,
      clicksByDate,
    };
  }

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
    await this.redisService.del(`link:${link.shortCode}`);
    this.logger.log(`Soft deleted link id: ${id}`);
  }

  async restore(id: number): Promise<void> {
    const link = await this.findOne(id);
    if (!link.deletedAt) {
      throw new BadRequestException('Link is not deleted');
    }
    link.deletedAt = undefined;
    link.isActive = true;
    await this.linkRepository.save(link);
    await this.redisService.del(`link:${link.shortCode}`);
    this.logger.log(`Restored link id: ${id}`);
  }

  async toggleActive(id: number, isActive: boolean): Promise<void> {
    const link = await this.findOne(id);
    if (link.deletedAt) {
      throw new BadRequestException('Cannot modify a deleted link');
    }
    link.isActive = isActive;
    await this.linkRepository.save(link);
    await this.redisService.del(`link:${link.shortCode}`);
    this.logger.log(`${isActive ? 'Enabled' : 'Disabled'} link id: ${id}`);
  }

  async hardDelete(id: number): Promise<void> {
    const link = await this.findOne(id);
    await this.linkRepository.remove(link);
    await this.redisService.del(`link:${link.shortCode}`);
    this.logger.log(`Hard deleted link id: ${id}`);
  }

  async countActive(): Promise<number> {
    return this.linkRepository.count({
      where: { isActive: true, deletedAt: IsNull() },
    });
  }

  getFullShortUrl(shortCode: string, baseUrl: string): string {
    return `${baseUrl}/${shortCode}`;
  }
}
