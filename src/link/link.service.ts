import {
  Injectable,
  NotFoundException,
  ConflictException,
  GoneException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import { Link } from './entities/link.entity';
import { CreateLinkDto } from './dto/create-link.dto';
import { AnalyticsService } from '../analytics/analytics.service';
import { ConfigService } from '@nestjs/config';

const RESERVED_CODES = ['links', 'stats', 'docs', 'api', 'auth', 'shorten', 'health'];

@Injectable()
export class LinkService {
  private readonly logger = new Logger(LinkService.name);
  private readonly baseUrl: string;

  constructor(
    @InjectRepository(Link)
    private readonly linkRepository: Repository<Link>,
    private readonly analyticsService: AnalyticsService,
    private readonly configService: ConfigService,
  ) {
    const port = this.configService.get<number>('app.port', 3000);
    this.baseUrl = `http://localhost:${port}`;
  }

  async create(dto: CreateLinkDto): Promise<Link> {
    const shortCode = dto.customCode || nanoid(8);

    if (dto.customCode) {
      if (RESERVED_CODES.includes(dto.customCode.toLowerCase())) {
        throw new BadRequestException(
          `Custom code "${dto.customCode}" is reserved`,
        );
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
    return saved;
  }

  async findByShortCode(shortCode: string): Promise<Link> {
    const link = await this.linkRepository.findOne({ where: { shortCode } });

    if (!link) {
      throw new NotFoundException('Short URL not found');
    }

    if (!link.isActive) {
      throw new GoneException('This short URL has been disabled');
    }

    if (link.expiresAt && new Date() > link.expiresAt) {
      throw new GoneException('This short URL has expired');
    }

    return link;
  }

  async resolveAndTrack(
    shortCode: string,
    ip?: string,
    userAgent?: string,
    referrer?: string,
  ): Promise<Link> {
    const link = await this.findByShortCode(shortCode);

    await this.analyticsService.recordClick(link.id, ip, userAgent, referrer);

    link.clickCount += 1;
    await this.linkRepository.save(link);

    return link;
  }

  async getStats(shortCode: string): Promise<{
    shortCode: string;
    originalUrl: string;
    totalClicks: number;
    clicksByDate: { date: string; count: string }[];
  }> {
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

  async findAll(): Promise<Link[]> {
    return this.linkRepository.find({ order: { createdAt: 'DESC' } });
  }

  async delete(id: number): Promise<void> {
    const result = await this.linkRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Link with id ${id} not found`);
    }
    this.logger.log(`Deleted link id: ${id}`);
  }

  getFullShortUrl(shortCode: string): string {
    return `${this.baseUrl}/${shortCode}`;
  }
}
