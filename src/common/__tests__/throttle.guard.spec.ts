import { ThrottleGuard } from '../guards/throttle.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

describe('ThrottleGuard', () => {
  let guard: ThrottleGuard;
  let reflector: Reflector;
  let redisService: jest.Mocked<RedisService>;
  let mockClient: any;

  beforeEach(() => {
    mockClient = { incr: jest.fn(), pexpire: jest.fn() };
    redisService = { getClient: jest.fn().mockReturnValue(mockClient) } as any;
    reflector = new Reflector();
    guard = new ThrottleGuard(reflector, redisService);
  });

  it('should allow requests within rate limit', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ ttl: 60, max: 10 });
    mockClient.incr.mockResolvedValue(1);
    mockClient.pexpire.mockResolvedValue(undefined);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ ip: '127.0.0.1' }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;

    await expect(guard.canActivate(mockContext)).resolves.toBe(true);
    expect(mockClient.pexpire).toHaveBeenCalled();
  });

  it('should block requests exceeding rate limit', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ ttl: 60, max: 1 });
    mockClient.incr.mockResolvedValue(2);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ ip: '127.0.0.1' }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;

    await expect(guard.canActivate(mockContext)).rejects.toThrow(HttpException);
  });

  it('should allow requests when no rate limit is set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ ip: '127.0.0.1' }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;

    await expect(guard.canActivate(mockContext)).resolves.toBe(true);
  });

  it('should fall back to in-memory when Redis fails', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ ttl: 60, max: 10 });
    mockClient.incr.mockRejectedValue(new Error('Redis down'));
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ ip: '127.0.0.1' }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;

    await expect(guard.canActivate(mockContext)).resolves.toBe(true);
  });
});
