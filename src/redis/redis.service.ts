import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly logger = new Logger(RedisService.name);
  private readonly defaultLockTtlMs = 5000;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('app.redis.host');
    const port = this.configService.get<number>('app.redis.port');
    const password = this.configService.get<string>('app.redis.password');
    const db = this.configService.get<number>('app.redis.db');

    this.redis = new Redis({
      host,
      port,
      password: password || undefined,
      db,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });

    this.redis.on('error', () => this.logger.error('Redis connection error'));
    this.redis.on('connect', () => this.logger.log('Connected to Redis'));
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.connect();
    } catch {
      this.logger.warn('Redis connection failed, caching disabled');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      this.logger.error('Redis set error');
    }
  }

  async setIfNotExists(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch {
      return false;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      this.logger.error('Redis del error');
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch {
      this.logger.error('Redis delPattern error');
    }
  }

  async acquireLock(key: string, ttlMs = this.defaultLockTtlMs): Promise<boolean> {
    try {
      const result = await this.redis.set(key, '1', 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch {
      return false;
    }
  }

  async releaseLock(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      this.logger.error('Redis releaseLock error');
    }
  }

  async executeWithLock<T>(
    lockKey: string,
    callback: () => Promise<T>,
    lockTtlMs = this.defaultLockTtlMs,
  ): Promise<T | null> {
    const acquired = await this.acquireLock(lockKey, lockTtlMs);
    if (!acquired) {
      return null;
    }
    try {
      return await callback();
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds = 300): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const lockKey = `lock:${key}`;
    const acquired = await this.acquireLock(lockKey);
    if (acquired) {
      try {
        const value = await factory();
        await this.set(key, value, ttlSeconds);
        return value;
      } finally {
        await this.releaseLock(lockKey);
      }
    }

    const waited = await this.waitForCache<T>(key, 100, 50);
    if (waited !== null) {
      return waited;
    }

    return factory();
  }

  private async waitForCache<T>(key: string, intervalMs: number, maxAttempts: number): Promise<T | null> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      const value = await this.get<T>(key);
      if (value !== null) {
        return value;
      }
    }
    return null;
  }

  getClient(): Redis {
    return this.redis;
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
