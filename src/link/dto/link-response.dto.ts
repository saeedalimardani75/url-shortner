import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LinkResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'abc123' })
  shortCode: string;

  @ApiProperty({ example: 'https://example.com/very/long/url' })
  originalUrl: string;

  @ApiProperty({ example: 'http://localhost:3000/abc123' })
  shortUrl: string;

  @ApiProperty({ example: 0 })
  clickCount: number;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59.000Z' })
  expiresAt?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;
}

export class LinkStatsDto {
  @ApiProperty({ example: 'abc123' })
  shortCode: string;

  @ApiProperty({ example: 'https://example.com/very/long/url' })
  originalUrl: string;

  @ApiProperty({ example: 42 })
  totalClicks: number;

  @ApiProperty({
    example: [{ date: '2024-01-15', count: '10' }],
  })
  clicksByDate: { date: string; count: string }[];
}
