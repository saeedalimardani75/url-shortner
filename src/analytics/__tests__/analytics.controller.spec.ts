import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AnalyticsController } from '../analytics.controller';
import { AnalyticsService } from '../analytics.service';
import { ApiKeyGuard } from '../../auth/guards/api-key.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthService } from '../../auth/auth.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;

  const mockAnalyticsService = {
    getAggregatedAnalytics: jest.fn().mockResolvedValue({
      totalClicks: 100,
      uniqueVisitors: 50,
      clicksByDate: [],
      clicksByHour: [],
      topCountries: [],
      topBrowsers: [],
      topOs: [],
      topReferrers: [],
    }),
  };

  const mockAuthService = {
    validateApiKey: jest.fn().mockResolvedValue({ id: 1, role: 'admin', isActive: true }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn().mockReturnValue(['admin', 'analytics']) } },
        ApiKeyGuard,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAnalytics', () => {
    it('should return aggregated analytics for a link', async () => {
      const req = { requestId: 'req-1' } as any;
      const result = await controller.getAnalytics(1, '2026-01-01', '2026-12-31', req);
      expect(result).toHaveProperty('totalClicks', 100);
      expect(mockAnalyticsService.getAggregatedAnalytics).toHaveBeenCalledWith(1, '2026-01-01', '2026-12-31', 'req-1');
    });

    it('should handle missing date params', async () => {
      const result = await controller.getAnalytics(1);
      expect(result).toHaveProperty('totalClicks', 100);
      expect(mockAnalyticsService.getAggregatedAnalytics).toHaveBeenCalledWith(1, undefined, undefined, undefined);
    });
  });
});
