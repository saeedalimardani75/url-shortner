import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RedisService } from './redis/redis.service';
import { QueuesService } from './queues/queues.service';
import * as client from 'prom-client';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  const pinoLogger = app.get(PinoLogger);
  app.useLogger(pinoLogger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');
  const baseUrl = configService.get<string>('app.baseUrl', `http://localhost:${port}`);

  app.setGlobalPrefix('api', { exclude: ['/:code', 'docs', 'health', 'metrics'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new RequestIdInterceptor(), new LoggingInterceptor());

  app.enableCors();

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

  const queuesService = app.get(QueuesService);
  await queuesService.scheduleCleanup();

  await app.listen(port);
  pinoLogger.log(`URL Shortener API running on http://localhost:${port}`);
  pinoLogger.log(`Swagger docs at http://localhost:${port}/docs`);
  pinoLogger.log(`Health check at http://localhost:${port}/health`);
  pinoLogger.log(`Metrics at http://localhost:${port}/metrics`);

  const signals = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.log(`Received ${signal}, starting graceful shutdown...`);
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 25000).unref();

      try {
        await app.close();
        logger.log('HTTP server closed');
        await redisService.onModuleDestroy();
        logger.log('Redis connections closed');
        client.register.clear();
        logger.log('Metrics cleared');
        process.exit(0);
      } catch (err) {
        logger.error(`Error during shutdown: ${err.message}`);
        process.exit(1);
      }
    });
  }
}

bootstrap();
