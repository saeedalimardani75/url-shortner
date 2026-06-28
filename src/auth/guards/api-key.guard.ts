import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException('API key is missing');
    }

    const keyEntity = await this.authService.validateApiKey(apiKey);

    if (!keyEntity) {
      this.logger.warn({
        message: 'Invalid API key attempt',
        requestId: request.requestId,
      });
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    request.apiKey = keyEntity;
    return true;
  }

  private extractApiKey(request: Request): string | undefined {
    const header = request.headers['x-api-key'];
    const value = Array.isArray(header) ? header[0] : header;
    const trimmed = value?.trim();
    return trimmed || undefined;
  }
}
