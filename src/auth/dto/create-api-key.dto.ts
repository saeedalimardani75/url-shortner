import { IsString, IsOptional, IsEnum, IsDateString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiKeyRole } from '../entities/api-key.entity';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'My App Key' })
  @IsString()
  @MinLength(3, { message: 'Name must be at least 3 characters' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  @Matches(/^[a-zA-Z0-9_\-\s]+$/, {
    message: 'Name can only contain letters, numbers, spaces, hyphens, and underscores',
  })
  name: string;

  @ApiPropertyOptional({ enum: ApiKeyRole, default: ApiKeyRole.CUSTOMER })
  @IsOptional()
  @IsEnum(ApiKeyRole)
  role?: ApiKeyRole;

  @ApiPropertyOptional({ example: '2027-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
