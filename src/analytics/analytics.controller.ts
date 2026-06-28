import { Controller, Get, Param, Query, UseGuards, ParseIntPipe, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { AggregatedAnalyticsDto } from './dto/analytics-response.dto';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get(':linkId')
  @UseGuards(ApiKeyGuard, RolesGuard)
  @Roles('admin', 'customer', 'analytics')
  @ApiBearerAuth('x-api-key')
  @ApiOperation({ summary: 'Get aggregated analytics for a link' })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-12-31' })
  async getAnalytics(
    @Param('linkId', ParseIntPipe) linkId: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() req?: Request,
  ): Promise<AggregatedAnalyticsDto> {
    return this.analyticsService.getAggregatedAnalytics(linkId, startDate, endDate, req?.['requestId']);
  }
}
