import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../entities/api-key.entity';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractKey(request);

    if (!apiKey) {
      throw new UnauthorizedException('API key is missing');
    }

    const keyEntity = await this.apiKeyRepository.findOne({
      where: { key: apiKey, isActive: true },
    });

    if (!keyEntity) {
      this.logger.warn(`Invalid API key attempt: ${apiKey.substring(0, 8)}...`);
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    (request as any).apiKey = keyEntity;
    return true;
  }

  private extractKey(request: Request): string | undefined {
    const authHeader = request.headers['x-api-key'] as string;
    return authHeader;
  }
}
