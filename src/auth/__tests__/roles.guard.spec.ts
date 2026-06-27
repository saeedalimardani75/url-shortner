import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common/interfaces';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../guards/roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ApiKey } from '../entities/api-key.entity';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  const mockApiKey = (role: string): ApiKey => ({
    id: 1,
    keyHash: 'hash',
    name: 'test',
    role,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const createContext = (apiKey?: ApiKey): ExecutionContext => {
    const request: Record<string, unknown> = {
      requestId: 'req-123',
      apiKey,
    };

    return {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('should allow access when no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createContext(mockApiKey('admin'));

    expect(guard.canActivate(context)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });

  it('should allow access when role matches', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin', 'analytics']);
    const context = createContext(mockApiKey('analytics'));

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject when apiKey is missing', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    const context = createContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject when role does not match', () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    const context = createContext(mockApiKey('readonly'));

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
