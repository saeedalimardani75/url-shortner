import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';

interface RateLimitOptions {
  ttl: number;
  max: number;
}

@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly logger = new Logger(ThrottleGuard.name);
  private readonly store = new Map<string, { count: number; resetTime: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const key = request.ip || 'unknown';
    const now = Date.now();

    let record = this.store.get(key);

    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + options.ttl * 1000 };
      this.store.set(key, record);
    }

    record.count++;

    if (record.count > options.max) {
      this.logger.warn(`Rate limit exceeded for ${key}`);
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
