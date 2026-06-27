import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { QueuesService } from '../queues.service';

describe('QueuesService', () => {
  let service: QueuesService;

  const mockAnalyticsQueue = {
    add: jest.fn().mockResolvedValue(undefined),
    isReady: jest.fn().mockResolvedValue(undefined),
  };

  const mockCleanupQueue = {
    add: jest.fn().mockResolvedValue(undefined),
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    isReady: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueuesService,
        { provide: getQueueToken('analytics'), useValue: mockAnalyticsQueue },
        { provide: getQueueToken('cleanup'), useValue: mockCleanupQueue },
      ],
    }).compile();

    service = module.get<QueuesService>(QueuesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addClickEvent', () => {
    it('should add a click event to the analytics queue', async () => {
      const event = {
        linkId: 1,
        ip: '127.0.0.1',
        userAgent: 'test-agent',
        referrer: 'https://x.com',
        timestamp: new Date().toISOString(),
      };

      await service.addClickEvent(event);
      expect(mockAnalyticsQueue.add).toHaveBeenCalledWith('record-click', event, expect.any(Object));
    });
  });

  describe('scheduleCleanup', () => {
    it('should schedule cleanup job if not already scheduled', async () => {
      await service.scheduleCleanup();
      expect(mockCleanupQueue.add).toHaveBeenCalled();
    });

    it('should not schedule cleanup job if already exists', async () => {
      mockCleanupQueue.getRepeatableJobs.mockResolvedValueOnce([
        { name: 'expired-links-cleanup', key: 'test', endDate: undefined, tz: undefined, cron: undefined, next: 0 },
      ]);
      await service.scheduleCleanup();
      expect(mockCleanupQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('ping', () => {
    it('should return true when queue is ready', async () => {
      const result = await service.ping();
      expect(result).toBe(true);
    });

    it('should return false when queue is not ready', async () => {
      mockAnalyticsQueue.isReady.mockRejectedValueOnce(new Error('Not ready'));
      const result = await service.ping();
      expect(result).toBe(false);
    });
  });
});
