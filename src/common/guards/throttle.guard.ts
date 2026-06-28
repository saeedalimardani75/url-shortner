import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';
import { RedisService } from '../../redis/redis.service';

interface RateLimitOptions {
  ttl: number;
  max: number;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly logger = new Logger(ThrottleGuard.name);
  private readonly store = new Map<string, RateLimitRecord>();
  private static readonly MAX_STORE_SIZE = 10000;
  private static readonly CLEANUP_THRESHOLD = 0.75;
  private storeLastCleanup = Date.now();
  private static readonly CLEANUP_INTERVAL_MS = 60_000;

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const key = `ratelimit:${request.ip || 'unknown'}:${context.getHandler().name}`;
    const windowMs = options.ttl * 1000;

    try {
      const client = this.redisService.getClient();
      const current = await client.incr(key);

      if (current === 1) {
        await client.pexpire(key, windowMs);
      }

      if (current > options.max) {
        this.logger.warn(`Rate limit exceeded for ${key}`);
        throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error({
        message: 'Redis rate limiter failed, falling back to in-memory',
        error: error instanceof Error ? error.message : String(error),
      });

      this.evictExpiredEntries();
      return this.checkInMemory(fallbackKey(request.ip), options, windowMs);
    }
  }

  private checkInMemory(key: string, options: RateLimitOptions, windowMs: number): boolean {
    const now = Date.now();
    let record = this.store.get(key);

    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + windowMs };
      this.store.set(key, record);
    }

    record.count++;

    if (record.count > options.max) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private evictExpiredEntries(): void {
    const now = Date.now();

    if (
      now - this.storeLastCleanup < ThrottleGuard.CLEANUP_INTERVAL_MS &&
      this.store.size < ThrottleGuard.MAX_STORE_SIZE
    ) {
      return;
    }

    this.storeLastCleanup = now;
    const targetSize = Math.floor(ThrottleGuard.MAX_STORE_SIZE * ThrottleGuard.CLEANUP_THRESHOLD);

    if (this.store.size < ThrottleGuard.MAX_STORE_SIZE) {
      return;
    }

    for (const [key, record] of this.store) {
      if (now > record.resetTime) {
        this.store.delete(key);
      }
      if (this.store.size <= targetSize) break;
    }
  }
}

const fallbackKey = (ip: string | undefined): string => ip || 'unknown';
