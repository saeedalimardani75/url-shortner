import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';
export const RateLimit = (ttl: number, max: number) => SetMetadata(RATE_LIMIT_KEY, { ttl, max });
