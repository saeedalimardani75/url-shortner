import { IsString, IsOptional, IsUrl, IsDateString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLinkDto {
  @ApiProperty({ example: 'https://example.com/very/long/url/that/needs/shortening' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  originalUrl: string;

  @ApiPropertyOptional({
    example: 'custom123',
    description: 'Optional custom short code (generated if omitted) - 3-32 alphanumeric characters',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: 'customCode can only contain letters, numbers, hyphens, and underscores' })
  customCode?: string;

  @ApiPropertyOptional({
    example: '2027-12-31T23:59:59.000Z',
    description: 'Optional expiration date',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
