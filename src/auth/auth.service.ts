import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ApiKey, ApiKeyRole } from './entities/api-key.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { RedisService } from '../redis/redis.service';

const API_KEY_PREFIX = 'sk_live_';
const REDIS_KEY_PREFIX = 'apikey:';

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

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    private readonly redisService: RedisService,
  ) {}

  async createApiKey(dto: CreateApiKeyDto): Promise<ApiKeyResponse> {
    const existing = await this.apiKeyRepository.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`API key with name "${dto.name}" already exists`);
    }

    const rawKey = `${API_KEY_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = this.hashApiKey(rawKey);

    const apiKey = this.apiKeyRepository.create({
      keyHash,
      name: dto.name,
      role: dto.role || ApiKeyRole.ADMIN,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });

    const saved = await this.apiKeyRepository.save(apiKey);
    this.logger.log(`Created API key: ${dto.name} (role: ${apiKey.role})`);

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

  async validateApiKey(rawKey: string): Promise<ApiKey | null> {
    const keyHash = this.hashApiKey(rawKey);
    const cacheKey = `${REDIS_KEY_PREFIX}${keyHash}`;

    const cached = await this.redisService.get<ApiKey>(cacheKey);
    if (cached) {
      if (cached.isActive && (!cached.expiresAt || new Date() < new Date(cached.expiresAt))) {
        return cached;
      }
      return null;
    }

    const apiKey = await this.apiKeyRepository.findOne({
      where: { keyHash, isActive: true },
    });

    if (!apiKey) {
      return null;
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      await this.apiKeyRepository.update(apiKey.id, { isActive: false });
      return null;
    }

    await this.redisService.set(cacheKey, apiKey, 3600);
    await this.apiKeyRepository.update(apiKey.id, { lastUsedAt: new Date() });

    return apiKey;
  }

  async rotateApiKey(id: number): Promise<ApiKeyResponse> {
    const existing = await this.apiKeyRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`API key with id ${id} not found`);
    }

    const rawKey = `${API_KEY_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = this.hashApiKey(rawKey);

    const oldCacheKey = `${REDIS_KEY_PREFIX}${existing.keyHash}`;
    await this.redisService.del(oldCacheKey);

    existing.keyHash = keyHash;
    existing.rotatedFromId = existing.id;
    existing.lastUsedAt = undefined;

    const saved = await this.apiKeyRepository.save(existing);
    this.logger.log(`Rotated API key: ${existing.name}`);

    return {
      plainKey: rawKey,
      apiKey: {
        id: saved.id,
        name: saved.name,
        role: saved.role,
        isActive: saved.isActive,
        createdAt: saved.createdAt,
      },
    };
  }

  async updateKeyStatus(id: number, isActive: boolean): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
    if (!apiKey) {
      throw new NotFoundException(`API key with id ${id} not found`);
    }

    apiKey.isActive = isActive;
    await this.apiKeyRepository.save(apiKey);

    const cacheKey = `${REDIS_KEY_PREFIX}${apiKey.keyHash}`;
    await this.redisService.del(cacheKey);

    this.logger.log(`${isActive ? 'Activated' : 'Deactivated'} API key: ${apiKey.name}`);
  }

  async updateKeyExpiration(id: number, expiresAt: string | null): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
    if (!apiKey) {
      throw new NotFoundException(`API key with id ${id} not found`);
    }

    apiKey.expiresAt = expiresAt ? new Date(expiresAt) : undefined;
    await this.apiKeyRepository.save(apiKey);

    const cacheKey = `${REDIS_KEY_PREFIX}${apiKey.keyHash}`;
    await this.redisService.del(cacheKey);
  }

  async findAll(): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      select: ['id', 'name', 'role', 'isActive', 'expiresAt', 'lastUsedAt', 'createdAt', 'updatedAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async delete(id: number): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
    if (!apiKey) {
      throw new NotFoundException(`API key with id ${id} not found`);
    }

    await this.apiKeyRepository.delete(id);

    const cacheKey = `${REDIS_KEY_PREFIX}${apiKey.keyHash}`;
    await this.redisService.del(cacheKey);

    this.logger.log(`Deleted API key: ${apiKey.name}`);
  }

  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }
}
