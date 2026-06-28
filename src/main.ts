import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as client from 'prom-client';
import { AppModule } from './app.module';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RedisService } from './redis/redis.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  const pinoLogger = app.get(PinoLogger);
  app.useLogger(pinoLogger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const shutdownTimeout = configService.get<number>('app.gracefulShutdownTimeoutMs', 25000);

  app.use(helmet());

  app.setGlobalPrefix('api', { exclude: ['/:code', 'docs', 'health', 'metrics'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalInterceptors(new RequestIdInterceptor(), new LoggingInterceptor());

  const corsOrigin = configService.get<string>('app.corsOrigin', '*');
  app.enableCors({
    origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'x-request-id'],
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('URL Shortener API')
    .setDescription('Production-grade URL shortening service with analytics, caching, and async processing')
    .setVersion('2.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  client.collectDefaultMetrics();

  app.getHttpAdapter().get('/metrics', (_req, res) => {
    res.set('Content-Type', client.register.contentType);
    client.register.metrics().then((data) => res.send(data));
  });

  const redisService = app.get(RedisService);
  await redisService.onModuleInit();

  await app.listen(port);
  pinoLogger.log(`URL Shortener API running on http://localhost:${port}`);
  pinoLogger.log(`Swagger docs at http://localhost:${port}/docs`);
  pinoLogger.log(`Health check at http://localhost:${port}/health`);
  pinoLogger.log(`Metrics at http://localhost:${port}/metrics`);

  const signals = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.log(`Received ${signal}, starting graceful shutdown...`);

      const forceExit = setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, shutdownTimeout);
      forceExit.unref();

      try {
        await Promise.allSettled([app.close(), redisService.onModuleDestroy()]);
        logger.log('HTTP server and Redis connections closed');
        client.register.clear();
        logger.log('Metrics cleared');
        process.exit(0);
      } catch (err) {
        logger.error(`Error during shutdown: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
  }
}

bootstrap();
