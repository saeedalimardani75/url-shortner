import { ThrottleGuard } from '../guards/throttle.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, HttpException } from '@nestjs/common';

describe('ThrottleGuard', () => {
  let guard: ThrottleGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new ThrottleGuard(reflector);
  });

  it('should allow requests within rate limit', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ ttl: 60, max: 10 });
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ ip: '127.0.0.1' }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should block requests exceeding rate limit', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ ttl: 60, max: 1 });
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ ip: '127.0.0.1' }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;

    guard.canActivate(mockContext);
    expect(() => guard.canActivate(mockContext)).toThrow(HttpException);
  });

  it('should allow requests when no rate limit is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ ip: '127.0.0.1' }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;

    expect(guard.canActivate(mockContext)).toBe(true);
  });
});
