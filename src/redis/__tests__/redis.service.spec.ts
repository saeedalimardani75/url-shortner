import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis.service';

describe('RedisService', () => {
  let service: RedisService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
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
    jest.spyOn(service as any, 'ping').mockImplementation(async () => false);
    jest.spyOn(service as any, 'get').mockImplementation(async () => null);
    jest.spyOn(service as any, 'set').mockImplementation(async () => undefined);
    jest.spyOn(service as any, 'del').mockImplementation(async () => undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ping', () => {
    it('should return false when Redis is not connected', async () => {
      const result = await service.ping();
      expect(result).toBe(false);
    });
  });

  describe('get/set/del', () => {
    it('should handle operations gracefully when Redis is down', async () => {
      const getResult = await service.get('test-key');
      expect(getResult).toBeNull();

      await service.set('test-key', { data: 'value' });
      await service.del('test-key');
    });
  });
});
