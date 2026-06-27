import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { ApiKey, ApiKeyRole } from '../entities/api-key.entity';
import { RedisService } from '../../redis/redis.service';
import { RedisKeys } from '../../redis/redis-keys';

const VALID_RAW_KEY = `sk_live_${'a'.repeat(48)}`;

describe('AuthService', () => {
  let service: AuthService;
  let apiKeyRepository: Repository<ApiKey>;

  const mockApiKey: ApiKey = {
    id: 1,
    keyHash: 'hashed-key',
    name: 'test-key',
    role: 'admin',
    isActive: true,
    expiresAt: undefined,
    lastUsedAt: undefined,
    rotatedFromId: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    setIfNotExists: jest.fn().mockResolvedValue(true),
    delPattern: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue(true),
    getClient: jest.fn().mockReturnValue({}),
    onModuleInit: jest.fn(),
  };

  const mockRepository = {
    create: jest.fn().mockReturnValue(mockApiKey),
    save: jest.fn().mockResolvedValue(mockApiKey),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([mockApiKey]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(ApiKey), useValue: mockRepository },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    apiKeyRepository = module.get(getRepositoryToken(ApiKey));

    jest.clearAllMocks();

    mockApiKey.keyHash = 'hashed-key';
    mockApiKey.isActive = true;
    mockApiKey.expiresAt = undefined;

    mockRepository.save.mockResolvedValue(mockApiKey);
    mockRepository.findOne.mockResolvedValue(null);
    mockRedis.setIfNotExists.mockResolvedValue(true);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createApiKey', () => {
    it('should create an API key', async () => {
      const dto = { name: 'new-key', role: ApiKeyRole.ADMIN };
      const result = await service.createApiKey(dto);

      expect(result).toHaveProperty('plainKey');
      expect(result.plainKey).toMatch(/^sk_live_[a-f0-9]{48}$/);
      expect(result).toHaveProperty('apiKey');
      expect(apiKeyRepository.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if name already exists', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockApiKey);
      const dto = { name: 'existing-key', role: ApiKeyRole.ADMIN };
      await expect(service.createApiKey(dto)).rejects.toThrow(ConflictException);
    });

    it('should reject expiration dates in the past', async () => {
      const dto = {
        name: 'new-key',
        expiresAt: '2020-01-01T00:00:00.000Z',
      };
      await expect(service.createApiKey(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateApiKey', () => {
    it('should validate a valid API key', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockApiKey);
      const result = await service.validateApiKey(VALID_RAW_KEY);
      expect(result).toBeDefined();
      expect(result?.isActive).toBe(true);
      expect(mockRedis.setIfNotExists).toHaveBeenCalled();
    });

    it('should return null for invalid key format', async () => {
      const result = await service.validateApiKey('invalid-key');
      expect(result).toBeNull();
      expect(apiKeyRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return null for invalid API key hash', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);
      const result = await service.validateApiKey(VALID_RAW_KEY);
      expect(result).toBeNull();
    });

    it('should use Redis cache for validation', async () => {
      mockRedis.get.mockResolvedValueOnce(mockApiKey);
      const result = await service.validateApiKey(VALID_RAW_KEY);
      expect(result).toBeDefined();
      expect(apiKeyRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return null for expired key from cache and invalidate cache', async () => {
      const expiredKey = { ...mockApiKey, expiresAt: new Date('2020-01-01') };
      mockRedis.get.mockResolvedValueOnce(expiredKey);
      const result = await service.validateApiKey(VALID_RAW_KEY);
      expect(result).toBeNull();
      expect(mockRedis.del).toHaveBeenCalled();
      expect(apiKeyRepository.update).toHaveBeenCalledWith(mockApiKey.id, { isActive: false });
    });

    it('should throttle lastUsedAt updates', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockApiKey);
      mockRedis.setIfNotExists.mockResolvedValueOnce(false);

      await service.validateApiKey(VALID_RAW_KEY);

      expect(apiKeyRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('rotateApiKey', () => {
    it('should rotate an API key', async () => {
      mockRepository.findOne.mockResolvedValueOnce({ ...mockApiKey });
      const result = await service.rotateApiKey(1);
      expect(result).toHaveProperty('plainKey');
      expect(mockRedis.del).toHaveBeenCalledWith(RedisKeys.apiKey('hashed-key'));
    });

    it('should throw NotFoundException if key not found', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.rotateApiKey(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateKeyStatus', () => {
    it('should activate/deactivate a key', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockApiKey);
      await service.updateKeyStatus(1, false);
      expect(apiKeyRepository.save).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should throw NotFoundException if key not found', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.updateKeyStatus(999, true)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateKeyExpiration', () => {
    it('should reject invalid expiration dates', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockApiKey);
      await expect(
        service.updateKeyExpiration(1, '2020-01-01T00:00:00.000Z'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return all API keys without keyHash', async () => {
      mockRepository.find.mockResolvedValueOnce([mockApiKey]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('should delete an API key', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockApiKey);
      await service.delete(1);
      expect(apiKeyRepository.delete).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should throw NotFoundException if key not found', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.delete(999)).rejects.toThrow(NotFoundException);
    });
  });
});
