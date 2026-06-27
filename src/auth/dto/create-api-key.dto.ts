import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ApiKeyRole {
  ADMIN = 'admin',
  READONLY = 'readonly',
  ANALYTICS = 'analytics',
}

export class CreateApiKeyDto {
  @ApiProperty({ example: 'My App Key' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: ApiKeyRole, default: ApiKeyRole.ADMIN })
  @IsOptional()
  @IsEnum(ApiKeyRole)
  role?: ApiKeyRole;

  @ApiPropertyOptional({ example: '2027-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
