import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LinkResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'abc123' })
  shortCode: string;

  @ApiProperty({ example: 'https://example.com/long/url' })
  originalUrl: string;

  @ApiProperty({ example: 'http://localhost:3000/abc123' })
  shortUrl: string;

  @ApiProperty({ example: 0 })
  clickCount: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiPropertyOptional({ example: '2027-12-31T23:59:59.000Z' })
  expiresAt?: string;

  @ApiProperty({ example: '2026-06-27T00:00:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({ example: '2026-07-27T00:00:00.000Z' })
  deletedAt?: string;
}

export class LinkStatsDto {
  @ApiProperty({ example: 'abc123' })
  shortCode: string;

  @ApiProperty({ example: 'https://example.com/long/url' })
  originalUrl: string;

  @ApiProperty({ example: 42 })
  totalClicks: number;

  @ApiProperty({ example: [{ date: '2026-06-27', count: 10 }] })
  clicksByDate: { date: string; count: number }[];
}

export class PaginatedLinksDto {
  @ApiProperty({ type: [LinkResponseDto] })
  items: LinkResponseDto[];

  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}
