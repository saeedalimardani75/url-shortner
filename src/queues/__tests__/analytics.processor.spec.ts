import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsProcessor } from '../analytics.processor';
import { AnalyticsService } from '../../analytics/analytics.service';
import { Click } from '../../analytics/entities/click.entity';
import { ANALYTICS_CONFIG } from '../../analytics/analytics.config';

describe('AnalyticsProcessor', () => {
  let processor: AnalyticsProcessor;

  const mockClickRepository = {
    create: jest.fn().mockReturnValue({ id: 1 }),
    save: jest.fn().mockResolvedValue({ id: 1 }),
  };

  const mockAnalyticsService = {
    invalidateCache: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsProcessor,
        { provide: getRepositoryToken(Click), useValue: mockClickRepository },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    processor = module.get<AnalyticsProcessor>(AnalyticsProcessor);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('processClick', () => {
    it('should record a click and invalidate cache', async () => {
      const job = {
        data: {
          linkId: 1,
          ip: 'a1b2c3d4e5f67890',
          userAgent: 'Mozilla/5.0 Chrome',
          referrer: 'https://x.com',
          timestamp: '2026-06-28T12:00:00.000Z',
        },
        id: 'job-1',
      } as any;

      await processor.processClick(job);

      expect(mockClickRepository.create).toHaveBeenCalledWith({
        linkId: 1,
        ip: 'a1b2c3d4e5f67890',
        userAgent: 'Mozilla/5.0 Chrome',
        referrer: 'https://x.com',
        clickedAt: new Date('2026-06-28T12:00:00.000Z'),
      });
      expect(mockClickRepository.save).toHaveBeenCalled();
      expect(mockAnalyticsService.invalidateCache).toHaveBeenCalledWith(1);
    });

    it('should truncate long user-agent strings', async () => {
      const longUA = 'x'.repeat(ANALYTICS_CONFIG.maxUserAgentLength + 100);
      const job = {
        data: { linkId: 1, userAgent: longUA, timestamp: new Date().toISOString() },
        id: 'job-2',
      } as any;

      await processor.processClick(job);

      const created = mockClickRepository.create.mock.calls[0][0];
      expect(created.userAgent.length).toBe(ANALYTICS_CONFIG.maxUserAgentLength);
    });

    it('should truncate long referrer strings', async () => {
      const longRef = 'x'.repeat(ANALYTICS_CONFIG.maxReferrerLength + 100);
      const job = {
        data: { linkId: 1, referrer: longRef, timestamp: new Date().toISOString() },
        id: 'job-3',
      } as any;

      await processor.processClick(job);

      const created = mockClickRepository.create.mock.calls[0][0];
      expect(created.referrer.length).toBe(ANALYTICS_CONFIG.maxReferrerLength);
    });
  });
});
