export const ANALYTICS_CONFIG = {
  cacheTtlSeconds: 300,
  topResultsLimit: 10,
  maxReferrerLength: 2048,
  maxUserAgentLength: 512,
} as const;

export type AnalyticsConfig = typeof ANALYTICS_CONFIG;
