import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from './entities/api-key.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  async createApiKey(dto: CreateApiKeyDto): Promise<ApiKey> {
    const existing = await this.apiKeyRepository.findOne({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`API key with name "${dto.name}" already exists`);
    }

    const key = `sk_live_${crypto.randomBytes(24).toString('hex')}`;

    const apiKey = this.apiKeyRepository.create({
      key,
      name: dto.name,
      role: dto.role || 'user',
    });

    const saved = await this.apiKeyRepository.save(apiKey);
    this.logger.log(`Created API key: ${dto.name}`);
    return saved;
  }

  async findAll(): Promise<ApiKey[]> {
    return this.apiKeyRepository.find();
  }

  async deactivate(id: number): Promise<void> {
    const result = await this.apiKeyRepository.update(id, { isActive: false });
    if (result.affected === 0) {
      throw new NotFoundException(`API key with id ${id} not found`);
    }
    this.logger.log(`Deactivated API key id: ${id}`);
  }

  async delete(id: number): Promise<void> {
    const result = await this.apiKeyRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`API key with id ${id} not found`);
    }
    this.logger.log(`Deleted API key id: ${id}`);
  }
}
