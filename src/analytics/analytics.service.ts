import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, Between, FindOptionsWhere } from 'typeorm';
import { Click } from './entities/click.entity';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis-keys';
import { ANALYTICS_CONFIG } from './analytics.config';

export interface AggregatedAnalyticsResult {
  totalClicks: number;
  uniqueVisitors: number;
  clicksByDate: { date: string; count: number }[];
  clicksByHour: { hour: number; count: number }[];
  topCountries: { country: string; count: number }[];
  topBrowsers: { browser: string; count: number }[];
  topOs: { os: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
}

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

  async getClicksGroupedByDate(linkId: number): Promise<{ date: string; count: number }[]> {
    const rows = await this.clickRepository
      .createQueryBuilder('click')
      .select('DATE(click.clickedAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('click.linkId = :linkId', { linkId })
      .groupBy('DATE(click.clickedAt)')
      .orderBy('DATE(click.clickedAt)', 'DESC')
      .getRawMany<{ date: string; count: string }>();

    return rows.map((row) => ({ date: row.date, count: parseInt(row.count, 10) }));
  }

  /**
   * Aggregated analytics are cached in Redis (eventual consistency). Cache is
   * invalidated when new clicks are persisted via the analytics queue processor.
   */
  async getAggregatedAnalytics(
    linkId: number,
    startDate?: string,
    endDate?: string,
    requestId?: string,
  ): Promise<AggregatedAnalyticsResult> {
    const startTime = Date.now();
    this.validateDateRange(startDate, endDate);

    const cacheKey = RedisKeys.analytics(linkId, startDate, endDate);
    const cached = await this.redisService.get<AggregatedAnalyticsResult>(cacheKey);

    if (cached) {
      this.logger.debug({
        message: 'Analytics cache hit',
        linkId,
        requestId,
        cacheHit: true,
        durationMs: Date.now() - startTime,
      });
      return cached;
    }

    this.logger.debug({
      message: 'Analytics cache miss',
      linkId,
      requestId,
      cacheHit: false,
    });

    const result = await this.redisService.getOrSet(
      cacheKey,
      () => this.computeAggregatedAnalytics(linkId, startDate, endDate),
      ANALYTICS_CONFIG.cacheTtlSeconds,
    );

    this.logger.log({
      message: 'Computed aggregated analytics',
      linkId,
      requestId,
      durationMs: Date.now() - startTime,
      totalClicks: result.totalClicks,
    });

    return result;
  }

  /**
   * Clears all cached aggregation variants for a link (any date-range key).
   */
  async invalidateCache(linkId: number): Promise<void> {
    try {
      await this.redisService.delPattern(RedisKeys.analyticsPattern(linkId));
      this.logger.debug({ message: 'Invalidated analytics cache', linkId });
    } catch (error) {
      this.logger.warn({
        message: 'Failed to invalidate analytics cache',
        linkId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private validateDateRange(startDate?: string, endDate?: string): void {
    if (startDate && !endDate) {
      throw new BadRequestException('endDate is required when startDate is provided');
    }
    if (endDate && !startDate) {
      throw new BadRequestException('startDate is required when endDate is provided');
    }
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new BadRequestException('Invalid date format');
      }
      if (start > end) {
        throw new BadRequestException('startDate must be before or equal to endDate');
      }
    }
  }

  private createFilteredQueryBuilder(linkId: number, startDate?: string, endDate?: string): SelectQueryBuilder<Click> {
    const queryBuilder = this.clickRepository.createQueryBuilder('click').where('click.linkId = :linkId', { linkId });

    if (startDate && endDate) {
      queryBuilder.andWhere('click.clickedAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    }

    return queryBuilder;
  }

  private async computeAggregatedAnalytics(
    linkId: number,
    startDate?: string,
    endDate?: string,
  ): Promise<AggregatedAnalyticsResult> {
    const whereClause: FindOptionsWhere<Click> = { linkId };
    if (startDate && endDate) {
      whereClause.clickedAt = Between(new Date(startDate), new Date(endDate));
    }

    const queryBuilder = this.createFilteredQueryBuilder(linkId, startDate, endDate);

    const [totalClicks, uniqueVisitors, clicksByDate, clicksByHour, topCountries, topBrowsers, topOs, topReferrers] =
      await Promise.all([
        this.clickRepository.count({ where: whereClause }),
        queryBuilder
          .clone()
          .select('COUNT(DISTINCT click.ip)', 'count')
          .getRawOne()
          .then((row) => parseInt(row?.count || '0', 10)),
        queryBuilder
          .clone()
          .select('DATE(click.clickedAt)', 'date')
          .addSelect('COUNT(*)', 'count')
          .groupBy('DATE(click.clickedAt)')
          .orderBy('DATE(click.clickedAt)', 'DESC')
          .getRawMany()
          .then((rows) => rows.map((row) => ({ date: row.date, count: parseInt(row.count, 10) }))),
        queryBuilder
          .clone()
          .select('EXTRACT(HOUR FROM click.clickedAt)', 'hour')
          .addSelect('COUNT(*)', 'count')
          .groupBy('EXTRACT(HOUR FROM click.clickedAt)')
          .orderBy('hour', 'ASC')
          .getRawMany()
          .then((rows) => rows.map((row) => ({ hour: parseInt(row.hour, 10), count: parseInt(row.count, 10) }))),
        this.fetchTopDimension(queryBuilder, 'country'),
        this.fetchTopDimension(queryBuilder, 'browser'),
        this.fetchTopDimension(queryBuilder, 'os'),
        this.fetchTopDimension(queryBuilder, 'referrer'),
      ]);

    return {
      totalClicks,
      uniqueVisitors,
      clicksByDate,
      clicksByHour,
      topCountries: topCountries as AggregatedAnalyticsResult['topCountries'],
      topBrowsers: topBrowsers as AggregatedAnalyticsResult['topBrowsers'],
      topOs: topOs as AggregatedAnalyticsResult['topOs'],
      topReferrers: topReferrers as AggregatedAnalyticsResult['topReferrers'],
    };
  }

  private async fetchTopDimension(
    queryBuilder: SelectQueryBuilder<Click>,
    column: 'country' | 'browser' | 'os' | 'referrer',
  ): Promise<Array<{ country?: string; browser?: string; os?: string; referrer?: string; count: number }>> {
    const rows = await queryBuilder
      .clone()
      .select(`click.${column}`, column)
      .addSelect('COUNT(*)', 'count')
      .andWhere(`click.${column} IS NOT NULL`)
      .groupBy(`click.${column}`)
      .orderBy('count', 'DESC')
      .limit(ANALYTICS_CONFIG.topResultsLimit)
      .getRawMany();

    return rows.map((row) => ({
      [column]: row[column],
      count: parseInt(row.count, 10),
    }));
  }
}
