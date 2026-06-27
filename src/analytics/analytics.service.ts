import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Click } from './entities/click.entity';
import { RedisService } from '../redis/redis.service';

const ANALYTICS_CACHE_TTL = 300;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Click)
    private readonly clickRepository: Repository<Click>,
    private readonly redisService: RedisService,
  ) {}

  async getClickCount(linkId: number): Promise<number> {
    return this.clickRepository.count({ where: { linkId } });
  }

  async getClicksGroupedByDate(linkId: number): Promise<{ date: string; count: string }[]> {
    return this.clickRepository
      .createQueryBuilder('click')
      .select('DATE(click.clickedAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('click.linkId = :linkId', { linkId })
      .groupBy('DATE(click.clickedAt)')
      .orderBy('DATE(click.clickedAt)', 'DESC')
      .getRawMany();
  }

  async getAggregatedAnalytics(
    linkId: number,
    startDate?: string,
    endDate?: string,
  ): Promise<{
    totalClicks: number;
    uniqueVisitors: number;
    clicksByDate: { date: string; count: number }[];
    clicksByHour: { hour: number; count: number }[];
    topCountries: { country: string; count: number }[];
    topBrowsers: { browser: string; count: number }[];
    topOs: { os: string; count: number }[];
    topReferrers: { referrer: string; count: number }[];
  }> {
    const cacheKey = `analytics:${linkId}:${startDate || ''}:${endDate || ''}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const whereClause: any = { linkId };
    if (startDate && endDate) {
      whereClause.clickedAt = Between(new Date(startDate), new Date(endDate));
    }

    const queryBuilder = this.clickRepository.createQueryBuilder('click').where('click.linkId = :linkId', { linkId });

    if (startDate && endDate) {
      queryBuilder.andWhere('click.clickedAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    }

    const [totalClicks, uniqueVisitors, clicksByDate, clicksByHour, topCountries, topBrowsers, topOs, topReferrers] =
      await Promise.all([
        this.clickRepository.count({ where: whereClause }),
        queryBuilder
          .clone()
          .select('COUNT(DISTINCT click.ip)', 'count')
          .getRawOne()
          .then((r) => parseInt(r?.count || '0', 10)),
        queryBuilder
          .clone()
          .select('DATE(click.clickedAt)', 'date')
          .addSelect('COUNT(*)', 'count')
          .groupBy('DATE(click.clickedAt)')
          .orderBy('DATE(click.clickedAt)', 'DESC')
          .getRawMany()
          .then((rows) => rows.map((r) => ({ date: r.date, count: parseInt(r.count, 10) }))),
        queryBuilder
          .clone()
          .select('EXTRACT(HOUR FROM click.clickedAt)', 'hour')
          .addSelect('COUNT(*)', 'count')
          .groupBy('EXTRACT(HOUR FROM click.clickedAt)')
          .orderBy('hour', 'ASC')
          .getRawMany()
          .then((rows) => rows.map((r) => ({ hour: parseInt(r.hour, 10), count: parseInt(r.count, 10) }))),
        queryBuilder
          .clone()
          .select('click.country', 'country')
          .addSelect('COUNT(*)', 'count')
          .where('click.country IS NOT NULL')
          .groupBy('click.country')
          .orderBy('count', 'DESC')
          .limit(10)
          .getRawMany()
          .then((rows) => rows.map((r) => ({ country: r.country, count: parseInt(r.count, 10) }))),
        queryBuilder
          .clone()
          .select('click.browser', 'browser')
          .addSelect('COUNT(*)', 'count')
          .where('click.browser IS NOT NULL')
          .groupBy('click.browser')
          .orderBy('count', 'DESC')
          .limit(10)
          .getRawMany()
          .then((rows) => rows.map((r) => ({ browser: r.browser, count: parseInt(r.count, 10) }))),
        queryBuilder
          .clone()
          .select('click.os', 'os')
          .addSelect('COUNT(*)', 'count')
          .where('click.os IS NOT NULL')
          .groupBy('click.os')
          .orderBy('count', 'DESC')
          .limit(10)
          .getRawMany()
          .then((rows) => rows.map((r) => ({ os: r.os, count: parseInt(r.count, 10) }))),
        queryBuilder
          .clone()
          .select('click.referrer', 'referrer')
          .addSelect('COUNT(*)', 'count')
          .where('click.referrer IS NOT NULL')
          .groupBy('click.referrer')
          .orderBy('count', 'DESC')
          .limit(10)
          .getRawMany()
          .then((rows) => rows.map((r) => ({ referrer: r.referrer, count: parseInt(r.count, 10) }))),
      ]);

    const result = {
      totalClicks,
      uniqueVisitors,
      clicksByDate,
      clicksByHour,
      topCountries,
      topBrowsers,
      topOs,
      topReferrers,
    };

    await this.redisService.set(cacheKey, result, ANALYTICS_CACHE_TTL);

    return result;
  }
}
