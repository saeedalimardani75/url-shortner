import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ApiKey, ApiKeyRole } from '../../auth/entities/api-key.entity';
import { AUTH_CONFIG } from '../../auth/auth.config';

@Injectable()
export class BootstrapSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapSeeder.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const count = await this.apiKeyRepository.count();
    if (count > 0) {
      this.logger.log('API keys found, skipping bootstrap seed');
      return;
    }

    const keyPrefix = this.configService.get<string>('app.apiKeyPrefix', AUTH_CONFIG.keyPrefix);
    const rawKey = `${keyPrefix}${randomBytes(AUTH_CONFIG.keyRandomBytes).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    await this.apiKeyRepository.save(
      this.apiKeyRepository.create({
        name: 'bootstrap-admin',
        keyHash,
        role: ApiKeyRole.ADMIN,
        isActive: true,
      }),
    );

    this.logger.warn('═══════════════════════════════════════════════════════════');
    this.logger.warn('  No API keys found — created bootstrap admin key');
    this.logger.warn('  SAVE THIS KEY — it will NOT be shown again:');
    this.logger.warn(`  ${rawKey}`);
    this.logger.warn('  Role: admin (can create/manage API keys and links)');
    this.logger.warn('  Use it in the x-api-key header for admin endpoints.');
    this.logger.warn('  Create customer keys via POST /api/admin/api-keys');
    this.logger.warn('═══════════════════════════════════════════════════════════');
  }
}
