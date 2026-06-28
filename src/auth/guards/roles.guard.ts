import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Request } from 'express';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.apiKey;

    if (!apiKey) {
      this.logger.warn({
        message: 'Roles guard: No API key found in request',
        requestId: request.requestId,
      });
      throw new UnauthorizedException('Authentication required');
    }

    const hasRole = requiredRoles.includes(apiKey.role);
    if (!hasRole) {
      this.logger.warn({
        message: 'Insufficient API key role',
        requestId: request.requestId,
        keyId: apiKey.id,
        role: apiKey.role,
        requiredRoles,
      });
      throw new ForbiddenException(`Requires one of roles: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
