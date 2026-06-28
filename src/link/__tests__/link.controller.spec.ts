import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LinkController } from '../link.controller';
import { LinkService } from '../link.service';
import { Link } from '../entities/link.entity';

describe('LinkController', () => {
  let controller: LinkController;

  const mockLink: Link = {
    id: 1,
    shortCode: 'abc123',
    originalUrl: 'https://example.com',
    clickCount: 0,
    isActive: true,
    expiresAt: undefined,
    deletedAt: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    clicks: [],
  };

  const mockLinkService = {
    create: jest.fn().mockResolvedValue(mockLink),
    resolveAndTrack: jest.fn().mockResolvedValue(mockLink),
    getStats: jest.fn().mockResolvedValue({
      shortCode: 'abc123',
      originalUrl: 'https://example.com',
      totalClicks: 10,
      clicksByDate: [],
    }),
    getFullShortUrl: jest.fn().mockReturnValue('http://localhost:3000/abc123'),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'app.baseUrl') return 'http://localhost:3000';
      if (key === 'app.redirectStatus') return 301;
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinkController],
      providers: [
        { provide: LinkService, useValue: mockLinkService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<LinkController>(LinkController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a short link', async () => {
      const dto = { originalUrl: 'https://example.com' };
      const req = { requestId: 'req-1' } as any;
      const result = await controller.create(dto, req);
      expect(result.shortCode).toBe('abc123');
      expect(result.shortUrl).toBe('http://localhost:3000/abc123');
      expect(mockLinkService.create).toHaveBeenCalledWith(dto, 'req-1');
    });
  });

  describe('redirect', () => {
    it('should redirect to the original URL', async () => {
      const res = { redirect: jest.fn() } as any;
      const req = {
        requestId: 'req-1',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test', referer: 'https://x.com' },
      } as any;
      await controller.redirect('abc123', res, req);
      expect(mockLinkService.resolveAndTrack).toHaveBeenCalledWith(
        'abc123',
        '127.0.0.1',
        'test',
        'https://x.com',
        'req-1',
      );
      expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com');
    });
  });

  describe('getStats', () => {
    it('should return link stats', async () => {
      const req = { requestId: 'req-1' } as any;
      const result = await controller.getStats('abc123', req);
      expect(result).toHaveProperty('totalClicks', 10);
      expect(mockLinkService.getStats).toHaveBeenCalledWith('abc123', 'req-1');
    });
  });
});
