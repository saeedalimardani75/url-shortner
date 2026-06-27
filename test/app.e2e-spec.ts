import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Link } from '../src/link/entities/link.entity';

describe('URL Shortener (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getRepositoryToken(Link))
      .useValue({
        create: jest.fn().mockReturnValue({
          id: 1,
          shortCode: 'test123',
          originalUrl: 'https://example.com',
          clickCount: 0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        save: jest.fn().mockResolvedValue({
          id: 1,
          shortCode: 'test123',
          originalUrl: 'https://example.com',
          clickCount: 0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([]),
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
        remove: jest.fn().mockResolvedValue({}),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['/:code', 'docs', 'health', 'metrics'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health endpoint', () => {
    it('GET /health should return health status', async () => {
      const response = await request(app.getHttpServer()).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('redis');
      expect(response.body.checks).toHaveProperty('bullmq');
    });
  });

  describe('Shorten URL', () => {
    it('POST /api/shorten should create a short URL', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/shorten')
        .send({ originalUrl: 'https://example.com' })
        .expect(201);

      expect(response.body).toHaveProperty('shortUrl');
      expect(response.body).toHaveProperty('shortCode');
    });

    it('POST /api/shorten should validate URL', async () => {
      await request(app.getHttpServer()).post('/api/shorten').send({ originalUrl: 'not-a-url' }).expect(400);
    });
  });

  describe('Swagger docs', () => {
    it('GET /docs should return Swagger UI', async () => {
      const response = await request(app.getHttpServer()).get('/docs');
      expect(response.status).toBe(200);
    });
  });

  describe('Metrics endpoint', () => {
    it('GET /metrics should return Prometheus metrics', async () => {
      const response = await request(app.getHttpServer()).get('/metrics');
      expect(response.status).toBe(200);
      expect(response.text).toContain('# HELP');
    });
  });

  describe('404 handling', () => {
    it('should return consistent error format', async () => {
      const response = await request(app.getHttpServer()).get('/api/nonexistent');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('statusCode');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('path');
    });
  });
});
