import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  BASE_URL: Joi.string().uri().default('http://localhost:3000'),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  REDIRECT_STATUS: Joi.number().valid(301, 302, 307, 308).default(301),

  DB_HOST: Joi.string().hostname().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().min(1).required(),
  DB_PASSWORD: Joi.string().min(1).required(),
  DB_NAME: Joi.string().min(1).default('urlshortener'),

  REDIS_HOST: Joi.string().hostname().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(8).required().error(new Error('REDIS_PASSWORD is required (min 8 chars) in production')),
    otherwise: Joi.string().optional().allow(''),
  }),
  REDIS_DB: Joi.number().integer().min(0).default(0),

  API_KEY_PREFIX: Joi.string().default('sk_live_'),
  CORS_ORIGIN: Joi.string().default('*'),
  GRACEFUL_SHUTDOWN_TIMEOUT: Joi.number().integer().min(1000).max(120000).default(25000),

  RATE_LIMIT_TTL: Joi.number().integer().min(1).default(60),
  RATE_LIMIT_MAX: Joi.number().integer().min(1).default(10),
});
