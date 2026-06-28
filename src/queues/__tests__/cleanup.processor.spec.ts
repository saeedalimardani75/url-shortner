import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CleanupProcessor } from '../cleanup.processor';
import { Link } from '../../link/entities/link.entity';
import { RedisService } from '../../redis/redis.service';

describe('CleanupProcessor', () => {
  let processor: CleanupProcessor;
  let linkRepository: Repository<Link>;
  let redisService: jest.Mocked<RedisService>;

  const mockLink: Link = {
    id: 1,
    shortCode: 'expired1',
    originalUrl: 'https://example.com',
    clickCount: 5,
    isActive: true,
    expiresAt: new Date('2020-01-01'),
    deletedAt: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    clicks: [],
  };

  beforeEach(async () => {
    redisService = {
      del: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CleanupProcessor,
        {
          provide: getRepositoryToken(Link),
          useValue: {
            find: jest.fn().mockResolvedValue([mockLink]),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    processor = module.get<CleanupProcessor>(CleanupProcessor);
    linkRepository = module.get(getRepositoryToken(Link));
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('cleanupExpiredLinks', () => {
    it('should deactivate expired links and clear cache', async () => {
      const job = { id: 'cleanup-1' } as any;
      await processor.cleanupExpiredLinks(job);

      expect(linkRepository.find).toHaveBeenCalled();
      expect(linkRepository.update).toHaveBeenCalledWith(1, { isActive: false });
      expect(redisService.del).toHaveBeenCalledWith('link:expired1');
    });

    it('should handle empty expired list gracefully', async () => {
      jest.spyOn(linkRepository, 'find').mockResolvedValueOnce([]);
      const job = { id: 'cleanup-2' } as any;

      await processor.cleanupExpiredLinks(job);
      expect(linkRepository.update).not.toHaveBeenCalled();
    });

    it('should continue processing other links when one fails', async () => {
      jest
        .spyOn(linkRepository, 'update')
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ affected: 1, raw: [], generatedMaps: [] });

      const secondLink = { ...mockLink, id: 2, shortCode: 'expired2' };
      jest.spyOn(linkRepository, 'find').mockResolvedValueOnce([mockLink, secondLink]);

      const job = { id: 'cleanup-3' } as any;
      await processor.cleanupExpiredLinks(job);

      expect(linkRepository.update).toHaveBeenCalledTimes(2);
      expect(redisService.del).toHaveBeenCalledTimes(1);
      expect(redisService.del).toHaveBeenCalledWith('link:expired2');
    });
  });
});
