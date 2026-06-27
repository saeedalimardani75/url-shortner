import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly logger = new Logger(RedisService.name);

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

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      this.logger.error('Redis del error');
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch {
      this.logger.error('Redis delPattern error');
    }
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
