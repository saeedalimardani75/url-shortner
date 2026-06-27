import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AnalyticsService } from '../analytics.service';
import { Click } from '../entities/click.entity';
import { RedisService } from '../../redis/redis.service';
import { RedisKeys } from '../../redis/redis-keys';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let clickRepository: Repository<Click>;
  let redisService: RedisService;

  const mockClicks = [
    {
      id: 1,
      linkId: 1,
      ip: 'a1b2c3d4e5f67890',
      userAgent: 'Chrome',
      referrer: 'https://x.com',
      country: 'US',
      browser: 'Chrome',
      os: 'Windows',
      clickedAt: new Date(),
    },
  ];

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue({ count: '5' }),
    clone: jest.fn().mockReturnThis(),
  };

  const mockRepository = {
    create: jest.fn().mockReturnValue(mockClicks[0]),
    save: jest.fn().mockResolvedValue(mockClicks[0]),
    count: jest.fn().mockResolvedValue(5),
    find: jest.fn().mockResolvedValue(mockClicks),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockRedisService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delPattern: jest.fn().mockResolvedValue(undefined),
    getOrSet: jest.fn().mockImplementation(async (_key, factory) => factory()),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(Click), useValue: mockRepository },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    clickRepository = module.get(getRepositoryToken(Click));
    redisService = module.get(RedisService);

    jest.clearAllMocks();
    mockQueryBuilder.clone.mockReturnValue(mockQueryBuilder);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getClickCount', () => {
    it('should return click count', async () => {
      const result = await service.getClickCount(1);
      expect(result).toBe(5);
      expect(clickRepository.count).toHaveBeenCalledWith({ where: { linkId: 1 } });
    });
  });

  describe('getClicksGroupedByDate', () => {
    it('should return clicks grouped by date', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([{ date: '2026-06-27', count: '5' }]);
      const result = await service.getClicksGroupedByDate(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('date');
    });
  });

  describe('getAggregatedAnalytics', () => {
    it('should return aggregated analytics', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getAggregatedAnalytics(1);
      expect(result).toHaveProperty('totalClicks');
      expect(result).toHaveProperty('uniqueVisitors');
      expect(result).toHaveProperty('clicksByDate');
      expect(result).toHaveProperty('clicksByHour');
      expect(result).toHaveProperty('topCountries');
      expect(result).toHaveProperty('topBrowsers');
      expect(result).toHaveProperty('topOs');
      expect(result).toHaveProperty('topReferrers');
      expect(redisService.getOrSet).toHaveBeenCalled();
    });

    it('should return cached results on subsequent calls', async () => {
      const cachedResult = {
        totalClicks: 10,
        uniqueVisitors: 5,
        clicksByDate: [],
        clicksByHour: [],
        topCountries: [],
        topBrowsers: [],
        topOs: [],
        topReferrers: [],
      };
      jest.spyOn(redisService, 'get').mockResolvedValueOnce(cachedResult);

      const result = await service.getAggregatedAnalytics(1);
      expect(result).toEqual(cachedResult);
      expect(clickRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(redisService.getOrSet).not.toHaveBeenCalled();
    });

    it('should use andWhere for top dimension queries to preserve linkId filter', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.getAggregatedAnalytics(1);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('click.country IS NOT NULL');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('click.browser IS NOT NULL');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('click.os IS NOT NULL');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('click.referrer IS NOT NULL');
    });

    it('should reject partial date ranges', async () => {
      await expect(service.getAggregatedAnalytics(1, '2026-01-01')).rejects.toThrow(BadRequestException);
      await expect(service.getAggregatedAnalytics(1, undefined, '2026-12-31')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject inverted date ranges', async () => {
      await expect(
        service.getAggregatedAnalytics(1, '2026-12-31', '2026-01-01'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('invalidateCache', () => {
    it('should delete analytics cache keys for a link', async () => {
      await service.invalidateCache(1);
      expect(redisService.delPattern).toHaveBeenCalledWith(RedisKeys.analyticsPattern(1));
    });
  });
});
