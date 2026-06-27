import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, GoneException, BadRequestException } from '@nestjs/common';
import { LinkService } from '../link.service';
import { Link } from '../entities/link.entity';
import { AnalyticsService } from '../../analytics/analytics.service';
import { RedisService } from '../../redis/redis.service';
import { QueuesService } from '../../queues/queues.service';

const createMockLink = (overrides: Partial<Link> = {}): Link => ({
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
  ...overrides,
});

describe('LinkService', () => {
  let service: LinkService;
  let linkRepository: any;
  let redisService: any;
  let mockQueues: any;

  beforeEach(async () => {
    linkRepository = {
      create: jest.fn().mockImplementation((data) => createMockLink(data)),
      save: jest.fn().mockImplementation((link) => Promise.resolve(link)),
      findOne: jest.fn().mockImplementation(() => Promise.resolve(createMockLink())),
      find: jest.fn().mockResolvedValue([createMockLink()]),
      findAndCount: jest.fn().mockResolvedValue([[createMockLink()], 1]),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockImplementation((link) => Promise.resolve(link)),
      count: jest.fn().mockResolvedValue(1),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    mockQueues = {
      addClickEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkService,
        { provide: getRepositoryToken(Link), useValue: linkRepository },
        {
          provide: AnalyticsService,
          useValue: {
            getClickCount: jest.fn().mockResolvedValue(10),
            getClicksGroupedByDate: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: RedisService, useValue: redisService },
        { provide: QueuesService, useValue: mockQueues },
      ],
    }).compile();

    service = module.get<LinkService>(LinkService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a short link', async () => {
      const dto = { originalUrl: 'https://example.com' };
      const result = await service.create(dto);
      expect(result).toBeDefined();
      expect(result.shortCode).toBeDefined();
      expect(linkRepository.create).toHaveBeenCalled();
      expect(linkRepository.save).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate custom code', async () => {
      linkRepository.findOne.mockResolvedValueOnce(createMockLink());
      const dto = { originalUrl: 'https://example.com', customCode: 'custom' };
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for reserved custom code', async () => {
      const dto = { originalUrl: 'https://example.com', customCode: 'admin' };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findByShortCode', () => {
    it('should find a link by short code', async () => {
      const result = await service.findByShortCode('abc123');
      expect(result).toBeDefined();
      expect(result.shortCode).toBe('abc123');
    });

    it('should throw NotFoundException if link not found', async () => {
      linkRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.findByShortCode('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw GoneException if link is inactive', async () => {
      linkRepository.findOne.mockResolvedValueOnce(createMockLink({ isActive: false }));
      await expect(service.findByShortCode('inactive')).rejects.toThrow(GoneException);
    });

    it('should use Redis cache on subsequent lookups', async () => {
      redisService.get.mockResolvedValueOnce(createMockLink());
      const result = await service.findByShortCode('abc123');
      expect(result).toBeDefined();
      expect(linkRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('resolveAndTrack', () => {
    it('should resolve and track a click', async () => {
      const result = await service.resolveAndTrack('abc123', '127.0.0.1', 'test-agent', 'https://referrer.com');
      expect(result.clickCount).toBe(1);
      expect(mockQueues.addClickEvent).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return link stats', async () => {
      const result = await service.getStats('abc123');
      expect(result).toHaveProperty('shortCode', 'abc123');
      expect(result).toHaveProperty('totalClicks', 10);
    });
  });

  describe('softDelete', () => {
    it('should soft delete a link', async () => {
      await service.softDelete(1);
      expect(linkRepository.save).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('should throw BadRequestException if link is not deleted', async () => {
      await expect(service.restore(1)).rejects.toThrow(BadRequestException);
    });

    it('should restore a soft-deleted link', async () => {
      linkRepository.findOne.mockResolvedValueOnce(createMockLink({ deletedAt: new Date() }));
      await service.restore(1);
      expect(linkRepository.save).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('toggleActive', () => {
    it('should toggle link active status', async () => {
      await service.toggleActive(1, false);
      expect(linkRepository.save).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
    });

    it('should throw BadRequestException for deleted link', async () => {
      linkRepository.findOne.mockResolvedValueOnce(createMockLink({ deletedAt: new Date() }));
      await expect(service.toggleActive(1, false)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllPaginated', () => {
    it('should return paginated results', async () => {
      const result = await service.findAllPaginated(1, 20);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('countActive', () => {
    it('should count active links', async () => {
      const result = await service.countActive();
      expect(result).toBe(1);
    });
  });

  describe('getFullShortUrl', () => {
    it('should return full short URL', () => {
      const result = service.getFullShortUrl('abc123', 'http://localhost:3000');
      expect(result).toBe('http://localhost:3000/abc123');
    });
  });
});
