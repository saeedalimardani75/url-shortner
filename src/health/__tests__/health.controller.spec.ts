import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health.controller';
import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import { QueuesService } from '../../queues/queues.service';

describe('HealthController', () => {
  let controller: HealthController;
  let mockResponse: any;

  const mockDataSource = {
    query: jest.fn().mockResolvedValue([{ 1: 1 }]),
  };

  const mockRedisService = {
    ping: jest.fn().mockResolvedValue(true),
  };

  const mockQueuesService = {
    ping: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    mockResponse = { status: jest.fn().mockReturnThis() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DataSource, useValue: mockDataSource },
        { provide: RedisService, useValue: mockRedisService },
        { provide: QueuesService, useValue: mockQueuesService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return healthy when all services are up', async () => {
      const result = await controller.check(mockResponse);
      expect(result.status).toBe('healthy');
      expect(result.checks.database.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.bullmq.status).toBe('up');
    });

    it('should return degraded when a service is down', async () => {
      mockRedisService.ping.mockResolvedValueOnce(false);
      const result = await controller.check(mockResponse);
      expect(result.status).toBe('degraded');
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(result.checks.redis.status).toBe('down');
    });
  });
});
