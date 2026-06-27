export const AUTH_CONFIG = {
  keyPrefix: 'sk_live_',
  keyRandomBytes: 24,
  cacheTtlSeconds: 3600,
  /** Minimum interval between lastUsedAt DB writes per key */
  lastUsedUpdateIntervalSeconds: 300,
  minKeyLength: 56,
} as const;

export type AuthConfig = typeof AUTH_CONFIG;
