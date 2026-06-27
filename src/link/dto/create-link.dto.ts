import { IsString, IsOptional, IsUrl, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLinkDto {
  @ApiProperty({ example: 'https://example.com/very/long/url/that/needs/shortening' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  originalUrl: string;

  @ApiPropertyOptional({
    example: 'custom123',
    description: 'Optional custom short code (generated if omitted)',
  })
  @IsOptional()
  @IsString()
  customCode?: string;

  @ApiPropertyOptional({
    example: '2027-12-31T23:59:59.000Z',
    description: 'Optional expiration date',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
