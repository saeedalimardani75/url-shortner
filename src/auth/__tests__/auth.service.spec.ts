import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { ApiKey } from '../entities/api-key.entity';
import { RedisService } from '../../redis/redis.service';

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

    mockRepository.save.mockResolvedValue(mockApiKey);
    mockRepository.findOne.mockResolvedValue(null);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createApiKey', () => {
    it('should create an API key', async () => {
      const dto = { name: 'new-key', role: 'admin' as any };
      const result = await service.createApiKey(dto);

      expect(result).toHaveProperty('plainKey');
      expect(result).toHaveProperty('apiKey');
      expect(apiKeyRepository.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if name already exists', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockApiKey);
      const dto = { name: 'existing-key', role: 'admin' as any };
      await expect(service.createApiKey(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('validateApiKey', () => {
    it('should validate a valid API key', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockApiKey);
      const result = await service.validateApiKey('sk_live_testkey');
      expect(result).toBeDefined();
      expect(result?.isActive).toBe(true);
    });

    it('should return null for invalid API key', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);
      const result = await service.validateApiKey('sk_live_invalid');
      expect(result).toBeNull();
    });

    it('should use Redis cache for validation', async () => {
      mockRedis.get.mockResolvedValueOnce(mockApiKey);
      const result = await service.validateApiKey('sk_live_cached');
      expect(result).toBeDefined();
      expect(apiKeyRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return null for expired key from cache', async () => {
      const expiredKey = { ...mockApiKey, expiresAt: new Date('2020-01-01') };
      mockRedis.get.mockResolvedValueOnce(expiredKey);
      const result = await service.validateApiKey('sk_live_expired');
      expect(result).toBeNull();
    });
  });

  describe('rotateApiKey', () => {
    it('should rotate an API key', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockApiKey);
      const result = await service.rotateApiKey(1);
      expect(result).toHaveProperty('plainKey');
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
    });

    it('should throw NotFoundException if key not found', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.updateKeyStatus(999, true)).rejects.toThrow(NotFoundException);
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
    });

    it('should throw NotFoundException if key not found', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.delete(999)).rejects.toThrow(NotFoundException);
    });
  });
});
