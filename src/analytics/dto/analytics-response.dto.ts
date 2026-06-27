import { ApiProperty } from '@nestjs/swagger';

export class DailyClicksDto {
  @ApiProperty({ example: '2026-06-27' })
  date: string;

  @ApiProperty({ example: 42 })
  count: number;
}

export class HourlyClicksDto {
  @ApiProperty({ example: 14 })
  hour: number;

  @ApiProperty({ example: 12 })
  count: number;
}

export class TopCountryDto {
  @ApiProperty({ example: 'US' })
  country: string;

  @ApiProperty({ example: 150 })
  count: number;
}

export class TopBrowserDto {
  @ApiProperty({ example: 'Chrome' })
  browser: string;

  @ApiProperty({ example: 200 })
  count: number;
}

export class TopOsDto {
  @ApiProperty({ example: 'Windows' })
  os: string;

  @ApiProperty({ example: 180 })
  count: number;
}

export class TopReferrerDto {
  @ApiProperty({ example: 'https://twitter.com' })
  referrer: string;

  @ApiProperty({ example: 50 })
  count: number;
}

export class AggregatedAnalyticsDto {
  @ApiProperty({ example: 1000 })
  totalClicks: number;

  @ApiProperty({ example: 500 })
  uniqueVisitors: number;

  @ApiProperty({ type: [DailyClicksDto] })
  clicksByDate: DailyClicksDto[];

  @ApiProperty({ type: [HourlyClicksDto] })
  clicksByHour: HourlyClicksDto[];

  @ApiProperty({ type: [TopCountryDto] })
  topCountries: TopCountryDto[];

  @ApiProperty({ type: [TopBrowserDto] })
  topBrowsers: TopBrowserDto[];

  @ApiProperty({ type: [TopOsDto] })
  topOs: TopOsDto[];

  @ApiProperty({ type: [TopReferrerDto] })
  topReferrers: TopReferrerDto[];
}
