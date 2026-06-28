import { Controller, Get, Logger, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Response } from 'express';
import { RedisService } from '../redis/redis.service';
import { QueuesService } from '../queues/queues.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly queuesService: QueuesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Check system health' })
  async check(@Res({ passthrough: true }) res: Response): Promise<{
    status: string;
    timestamp: string;
    uptime: number;
    checks: Record<string, { status: string; latency?: string }>;
  }> {
    const checks: Record<string, { status: string; latency?: string }> = {};

    const dbStart = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      checks.database = { status: 'up', latency: `${Date.now() - dbStart}ms` };
    } catch {
      checks.database = { status: 'down' };
    }

    const redisStart = Date.now();
    const redisOk = await this.redisService.ping();
    checks.redis = {
      status: redisOk ? 'up' : 'down',
      latency: redisOk ? `${Date.now() - redisStart}ms` : undefined,
    };

    const bullStart = Date.now();
    const bullOk = await this.queuesService.ping();
    checks.bullmq = {
      status: bullOk ? 'up' : 'down',
      latency: bullOk ? `${Date.now() - bullStart}ms` : undefined,
    };

    const allUp = Object.values(checks).every((c) => c.status === 'up');

    if (!allUp) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: allUp ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
    };
  }
}
