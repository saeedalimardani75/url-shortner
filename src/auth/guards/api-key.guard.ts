import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('API key is missing');
    }

    const keyEntity = await this.authService.validateApiKey(apiKey);

    if (!keyEntity) {
      this.logger.warn(`Invalid API key attempt`);
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    (request as any).apiKey = keyEntity;
    return true;
  }
}
