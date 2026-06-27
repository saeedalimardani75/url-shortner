import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common/interfaces';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { AuthService } from '../auth.service';
import { ApiKey } from '../entities/api-key.entity';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let authService: jest.Mocked<Pick<AuthService, 'validateApiKey'>>;

  const mockApiKey: ApiKey = {
    id: 1,
    keyHash: 'hash',
    name: 'test',
    role: 'admin',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createContext = (headers: Record<string, string | string[]>): ExecutionContext => {
    const request: Record<string, unknown> = {
      headers,
      requestId: 'req-123',
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  };

  beforeEach(() => {
    authService = {
      validateApiKey: jest.fn(),
    };
    guard = new ApiKeyGuard(authService as unknown as AuthService);
  });

  it('should reject missing API key', async () => {
    const context = createContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject invalid API key', async () => {
    authService.validateApiKey.mockResolvedValueOnce(null);
    const context = createContext({ 'x-api-key': 'sk_live_invalid' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should attach apiKey to request on success', async () => {
    authService.validateApiKey.mockResolvedValueOnce(mockApiKey);
    const context = createContext({ 'x-api-key': ' sk_live_test ' });
    const request = context.switchToHttp().getRequest();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.validateApiKey).toHaveBeenCalledWith('sk_live_test');
    expect(request.apiKey).toEqual(mockApiKey);
  });

  it('should use first value when header is an array', async () => {
    authService.validateApiKey.mockResolvedValueOnce(mockApiKey);
    const context = createContext({ 'x-api-key': ['sk_live_first', 'sk_live_second'] });

    await guard.canActivate(context);

    expect(authService.validateApiKey).toHaveBeenCalledWith('sk_live_first');
  });
});
