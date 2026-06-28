import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis.service';

jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    scan: jest.fn(),
    ping: jest.fn(),
    quit: jest.fn(),
    connect: jest.fn(),
    on: jest.fn(),
  };
  return jest.fn(() => mockRedis);
});

describe('RedisService', () => {
  let service: RedisService;
  let redisClient: any;

  const mockConfigService = {
    get: jest.fn((key: string, _default?: unknown) => {
      const config: Record<string, any> = {
        'app.redis.host': 'localhost',
        'app.redis.port': 6379,
        'app.redis.password': '',
        'app.redis.db': 0,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<RedisService>(RedisService);
    redisClient = (service as any).redis;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return parsed value when key exists', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify({ url: 'https://example.com' }));
      const result = await service.get('test-key');
      expect(result).toEqual({ url: 'https://example.com' });
    });

    it('should return null when key does not exist', async () => {
      redisClient.get.mockResolvedValue(null);
      const result = await service.get('test-key');
      expect(result).toBeNull();
    });

    it('should return null on Redis error', async () => {
      redisClient.get.mockRejectedValue(new Error('Connection lost'));
      const result = await service.get('test-key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should store value with TTL', async () => {
      redisClient.setex.mockResolvedValue('OK');
      await service.set('test-key', { data: 'value' }, 300);
      expect(redisClient.setex).toHaveBeenCalledWith('test-key', 300, JSON.stringify({ data: 'value' }));
    });

    it('should handle Redis error gracefully', async () => {
      redisClient.setex.mockRejectedValue(new Error('Connection lost'));
      await expect(service.set('test-key', 'value', 300)).resolves.toBeUndefined();
    });
  });

  describe('del', () => {
    it('should delete a key', async () => {
      redisClient.del.mockResolvedValue(1);
      await service.del('test-key');
      expect(redisClient.del).toHaveBeenCalledWith('test-key');
    });
  });

  describe('delPattern', () => {
    it('should delete keys matching pattern', async () => {
      redisClient.scan.mockResolvedValueOnce(['0', ['key:1', 'key:2']]);
      redisClient.del.mockResolvedValue(2);

      await service.delPattern('key:*');
      expect(redisClient.scan).toHaveBeenCalledWith('0', 'MATCH', 'key:*', 'COUNT', 100);
      expect(redisClient.del).toHaveBeenCalledWith('key:1', 'key:2');
    });

    it('should handle multiple scan pages', async () => {
      redisClient.scan.mockResolvedValueOnce(['1', ['key:1']]).mockResolvedValueOnce(['0', ['key:2']]);
      redisClient.del.mockResolvedValue(1);

      await service.delPattern('key:*');
      expect(redisClient.scan).toHaveBeenCalledTimes(2);
      expect(redisClient.del).toHaveBeenCalledTimes(2);
    });

    it('should handle Redis error gracefully', async () => {
      redisClient.scan.mockRejectedValue(new Error('Connection lost'));
      await expect(service.delPattern('key:*')).resolves.toBeUndefined();
    });
  });

  describe('setIfNotExists', () => {
    it('should return true when key is set', async () => {
      redisClient.set = jest.fn().mockResolvedValue('OK');
      const result = await service.setIfNotExists('lock-key', 60);
      expect(result).toBe(true);
    });

    it('should return false when key already exists', async () => {
      redisClient.set = jest.fn().mockResolvedValue(null);
      const result = await service.setIfNotExists('lock-key', 60);
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      redisClient.set = jest.fn().mockRejectedValue(new Error('Redis down'));
      const result = await service.setIfNotExists('lock-key', 60);
      expect(result).toBe(false);
    });
  });

  describe('acquireLock / releaseLock', () => {
    it('should acquire and release a lock', async () => {
      redisClient.set = jest.fn().mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);

      const acquired = await service.acquireLock('mylock', 5000);
      expect(acquired).toBe(true);

      await service.releaseLock('mylock');
      expect(redisClient.del).toHaveBeenCalledWith('mylock');
    });
  });

  describe('executeWithLock', () => {
    it('should execute callback when lock is acquired', async () => {
      redisClient.set = jest.fn().mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);

      const callback = jest.fn().mockResolvedValue('result');
      const result = await service.executeWithLock('lock-key', callback, 5000);
      expect(result).toBe('result');
      expect(callback).toHaveBeenCalled();
    });

    it('should return null when lock is not acquired', async () => {
      redisClient.set = jest.fn().mockResolvedValue(null);
      const callback = jest.fn();
      const result = await service.executeWithLock('lock-key', callback, 5000);
      expect(result).toBeNull();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getOrSet', () => {
    it('should return cached value when available', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify({ cached: true }));
      const factory = jest.fn();
      const result = await service.getOrSet('cache-key', factory, 300);
      expect(result).toEqual({ cached: true });
      expect(factory).not.toHaveBeenCalled();
    });

    it('should call factory and cache result when cache misses', async () => {
      redisClient.get.mockResolvedValue(null);
      redisClient.set = jest.fn().mockResolvedValue('OK');
      redisClient.setex = jest.fn().mockResolvedValue('OK');
      redisClient.del.mockResolvedValue(1);

      const factory = jest.fn().mockResolvedValue({ fresh: true });
      const result = await service.getOrSet('cache-key', factory, 300);
      expect(result).toEqual({ fresh: true });
      expect(factory).toHaveBeenCalled();
    });
  });

  describe('getClient', () => {
    it('should return the underlying Redis client', () => {
      const client = service.getClient();
      expect(client).toBe(redisClient);
    });
  });

  describe('ping', () => {
    it('should return true when Redis responds', async () => {
      redisClient.ping.mockResolvedValue('PONG');
      const result = await service.ping();
      expect(result).toBe(true);
    });

    it('should return false when Redis fails', async () => {
      redisClient.ping.mockRejectedValue(new Error('Not connected'));
      const result = await service.ping();
      expect(result).toBe(false);
    });
  });
});
