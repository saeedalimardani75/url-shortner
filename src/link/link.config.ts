export const LINK_CONFIG = {
  reservedCodes: [
    'links',
    'stats',
    'docs',
    'api',
    'auth',
    'shorten',
    'health',
    'metrics',
    'admin',
    'api-docs',
    'swagger',
    'favicon.ico',
    'robots.txt',
    'sitemap.xml',
  ] as readonly string[],
  defaultShortCodeLength: 8,
  maxShortCodeRetries: 5,
  cacheTtlSeconds: 600,
  defaultRedirectStatus: 301,
  clickCounterIncrement: 1,
  cacheStampedeLockTtlMs: 3000,
  cacheStampedePollMax: 20,
  cacheStampedePollIntervalMs: 50,
} satisfies Record<string, unknown>;

export type LinkConfig = typeof LINK_CONFIG;