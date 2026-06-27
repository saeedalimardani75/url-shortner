export class RedisKeys {
  private static readonly PREFIX = 'link';

  static link(shortCode: string): string {
    return `${this.PREFIX}:${shortCode}`;
  }

  static linkLock(shortCode: string): string {
    return `${this.PREFIX}:lock:${shortCode}`;
  }

  static analytics(linkId: number, startDate?: string, endDate?: string): string {
    return `analytics:${linkId}:${startDate || ''}:${endDate || ''}`;
  }

  static analyticsLock(linkId: number): string {
    return `analytics:lock:${linkId}`;
  }

  static analyticsPattern(linkId: number): string {
    return `analytics:${linkId}:*`;
  }

  static apiKey(keyHash: string): string {
    return `apikey:${keyHash}`;
  }

  static apiKeyUsageThrottle(keyId: number): string {
    return `apikey:usage:${keyId}`;
  }
}