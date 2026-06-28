import { Injectable, ConflictException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ApiKey, ApiKeyRole } from './entities/api-key.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis-keys';
import { AUTH_CONFIG } from './auth.config';

export interface ApiKeyResponse {
  plainKey: string;
  apiKey: {
    id: number;
    name: string;
    role: string;
    isActive: boolean;
    expiresAt?: string;
    createdAt: Date;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly keyPrefix: string;

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.keyPrefix = this.configService.get<string>('app.apiKeyPrefix', AUTH_CONFIG.keyPrefix);
  }

  async createApiKey(dto: CreateApiKeyDto, requestId?: string): Promise<ApiKeyResponse> {
    const existing = await this.apiKeyRepository.findOne({
      where: { name: dto.name },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) {
      this.logger.warn({
        message: 'Duplicate API key name attempt',
        requestId,
        name: dto.name,
      });
      throw new ConflictException(`API key with name "${dto.name}" already exists`);
    }

    const expiresAt = dto.expiresAt ? this.parseExpirationDate(dto.expiresAt) : undefined;
    const rawKey = this.generateRawKey();
    const keyHash = this.hashApiKey(rawKey);

    const apiKey = this.apiKeyRepository.create({
      keyHash,
      name: dto.name,
      role: dto.role || ApiKeyRole.CUSTOMER,
      expiresAt,
    });

    const saved = await this.apiKeyRepository.save(apiKey);

    this.logger.log({
      message: 'Created API key',
      requestId,
      keyId: saved.id,
      name: saved.name,
      role: saved.role,
    });

    return this.toApiKeyResponse(rawKey, saved);
  }

  async validateApiKey(rawKey: string): Promise<ApiKey | null> {
    if (!this.isValidKeyFormat(rawKey)) {
      this.logger.warn({
        message: 'Invalid API key format attempt',
        keyPrefix: rawKey.substring(0, 10),
        keyLength: rawKey.length,
      });
      return null;
    }

    const keyHash = this.hashApiKey(rawKey);
    const cacheKey = RedisKeys.apiKey(keyHash);

    const cached = await this.redisService.get<ApiKey>(cacheKey);
    if (cached) {
      if (!this.isKeyUsable(cached)) {
        await this.invalidateApiKeyCache(keyHash);
        if (cached.expiresAt && new Date() > new Date(cached.expiresAt)) {
          await this.deactivateExpiredKey(cached.id);
        }
        return null;
      }

      await this.recordKeyUsage(cached.id);
      return cached;
    }

    const apiKey = await this.apiKeyRepository.findOne({
      where: { keyHash, isActive: true },
    });

    if (!apiKey) {
      return null;
    }

    if (!this.isKeyUsable(apiKey)) {
      if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
        await this.deactivateExpiredKey(apiKey.id);
      }
      await this.invalidateApiKeyCache(keyHash);
      return null;
    }

    await this.redisService.set(cacheKey, apiKey, AUTH_CONFIG.cacheTtlSeconds);
    await this.recordKeyUsage(apiKey.id);

    return apiKey;
  }

  async rotateApiKey(id: number, requestId?: string): Promise<ApiKeyResponse> {
    const existing = await this.apiKeyRepository.findOne({ where: { id } });
    if (!existing) {
      this.logger.warn({
        message: 'Rotate attempt on non-existent API key',
        requestId,
        keyId: id,
      });
      throw new NotFoundException(`API key with id ${id} not found`);
    }

    const rawKey = this.generateRawKey();
    const keyHash = this.hashApiKey(rawKey);
    const originalId = existing.id;

    await this.invalidateApiKeyCache(existing.keyHash);

    existing.keyHash = keyHash;
    existing.rotatedFromId = existing.rotatedFromId || originalId;
    existing.lastUsedAt = undefined;

    const saved = await this.apiKeyRepository.save(existing);

    this.logger.log({
      message: 'Rotated API key',
      requestId,
      keyId: saved.id,
      name: saved.name,
    });

    return this.toApiKeyResponse(rawKey, saved);
  }

  async updateKeyStatus(id: number, isActive: boolean, requestId?: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
    if (!apiKey) {
      this.logger.warn({
        message: 'Status update attempt on non-existent API key',
        requestId,
        keyId: id,
        status: isActive ? 'activate' : 'deactivate',
      });
      throw new NotFoundException(`API key with id ${id} not found`);
    }

    apiKey.isActive = isActive;
    await this.apiKeyRepository.save(apiKey);
    await this.invalidateApiKeyCache(apiKey.keyHash);

    this.logger.log({
      message: isActive ? 'Activated API key' : 'Deactivated API key',
      requestId,
      keyId: id,
      name: apiKey.name,
    });
  }

  async updateKeyExpiration(id: number, expiresAt: string | null, requestId?: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
    if (!apiKey) {
      this.logger.warn({
        message: 'Expiration update attempt on non-existent API key',
        requestId,
        keyId: id,
      });
      throw new NotFoundException(`API key with id ${id} not found`);
    }

    apiKey.expiresAt = expiresAt ? this.parseExpirationDate(expiresAt) : undefined;
    await this.apiKeyRepository.save(apiKey);
    await this.invalidateApiKeyCache(apiKey.keyHash);

    this.logger.log({
      message: 'Updated API key expiration',
      requestId,
      keyId: id,
      name: apiKey.name,
      expiresAt: apiKey.expiresAt?.toISOString(),
    });
  }

  async findAll(
    page = 1,
    limit = 50,
  ): Promise<{ items: ApiKey[]; total: number; page: number; limit: number; totalPages: number }> {
    const [items, total] = await this.apiKeyRepository.findAndCount({
      select: ['id', 'name', 'role', 'isActive', 'expiresAt', 'lastUsedAt', 'createdAt', 'updatedAt'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async delete(id: number, requestId?: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
    if (!apiKey) {
      this.logger.warn({
        message: 'Delete attempt on non-existent API key',
        requestId,
        keyId: id,
      });
      throw new NotFoundException(`API key with id ${id} not found`);
    }

    await this.apiKeyRepository.delete(id);
    await this.invalidateApiKeyCache(apiKey.keyHash);

    this.logger.log({
      message: 'Deleted API key',
      requestId,
      keyId: id,
      name: apiKey.name,
    });
  }

  private generateRawKey(): string {
    return `${this.keyPrefix}${randomBytes(AUTH_CONFIG.keyRandomBytes).toString('hex')}`;
  }

  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  private isValidKeyFormat(rawKey: string): boolean {
    const expectedLength = this.keyPrefix.length + AUTH_CONFIG.keyRandomBytes * 2;
    const hexPattern = new RegExp(`^${this.keyPrefix}[a-f0-9]{${AUTH_CONFIG.keyRandomBytes * 2}}$`);
    return hexPattern.test(rawKey) && rawKey.length === expectedLength;
  }

  private isKeyUsable(apiKey: ApiKey): boolean {
    if (!apiKey.isActive) {
      return false;
    }
    if (apiKey.expiresAt && new Date() > new Date(apiKey.expiresAt)) {
      return false;
    }
    return true;
  }

  private parseExpirationDate(expiresAt: string): Date {
    const parsed = new Date(expiresAt);
    const now = new Date();
    const maxExpiration = new Date(now);
    maxExpiration.setFullYear(maxExpiration.getFullYear() + 10);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid expiration date format');
    }
    if (parsed <= now) {
      throw new BadRequestException('Expiration date must be in the future');
    }
    if (parsed > maxExpiration) {
      throw new BadRequestException('Expiration date cannot be more than 10 years in the future');
    }
    return parsed;
  }

  private toApiKeyResponse(rawKey: string, saved: ApiKey): ApiKeyResponse {
    return {
      plainKey: rawKey,
      apiKey: {
        id: saved.id,
        name: saved.name,
        role: saved.role,
        isActive: saved.isActive,
        expiresAt: saved.expiresAt?.toISOString(),
        createdAt: saved.createdAt,
      },
    };
  }

  private async invalidateApiKeyCache(keyHash: string): Promise<void> {
    try {
      await this.redisService.del(RedisKeys.apiKey(keyHash));
    } catch (error) {
      this.logger.warn({
        message: 'Failed to invalidate API key cache',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async deactivateExpiredKey(keyId: number): Promise<void> {
    try {
      await this.apiKeyRepository.update(keyId, { isActive: false });
      this.logger.log({ message: 'Deactivated expired API key', keyId });
    } catch (error) {
      this.logger.warn({
        message: 'Failed to deactivate expired API key',
        keyId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Throttles lastUsedAt DB writes to avoid updating on every authenticated request.
   */
  private async recordKeyUsage(keyId: number): Promise<void> {
    const throttleKey = RedisKeys.apiKeyUsageThrottle(keyId);
    const shouldUpdate = await this.redisService.setIfNotExists(throttleKey, AUTH_CONFIG.lastUsedUpdateIntervalSeconds);

    if (!shouldUpdate) {
      return;
    }

    try {
      await this.apiKeyRepository.update(keyId, { lastUsedAt: new Date() });
    } catch (error) {
      this.logger.warn({
        message: 'Failed to update API key lastUsedAt',
        keyId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
