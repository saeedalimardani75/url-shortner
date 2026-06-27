import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ApiKeyRole {
  ADMIN = 'admin',
  USER = 'user',
}

export class CreateApiKeyDto {
  @ApiProperty({ example: 'My App Key' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: ApiKeyRole, default: ApiKeyRole.USER })
  @IsOptional()
  @IsEnum(ApiKeyRole)
  role?: ApiKeyRole;
}
