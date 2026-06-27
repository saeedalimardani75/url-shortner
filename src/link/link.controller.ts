import { Controller, Get, Post, Param, Body, Res, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { LinkService } from './link.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { LinkResponseDto, LinkStatsDto } from './dto/link-response.dto';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { LINK_CONFIG } from './link.config';

@ApiTags('Public - Links')
@Controller()
export class LinkController {
  private readonly baseUrl: string;
  private readonly redirectStatus: number;

  constructor(
    private readonly linkService: LinkService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('app.baseUrl', 'http://localhost:3000');
    this.redirectStatus = this.configService.get<number>('app.redirectStatus', LINK_CONFIG.defaultRedirectStatus);
  }

  @Post('shorten')
  @ApiOperation({ summary: '[Public] Create a shortened URL' })
  @RateLimit(60, 10)
  async create(@Body() dto: CreateLinkDto, @Req() req: Request): Promise<LinkResponseDto> {
    const requestId = req['requestId'];
    const link = await this.linkService.create(dto, requestId);
    return {
      id: link.id,
      shortCode: link.shortCode,
      originalUrl: link.originalUrl,
      shortUrl: this.linkService.getFullShortUrl(link.shortCode, this.baseUrl),
      clickCount: link.clickCount,
      isActive: link.isActive,
      expiresAt: link.expiresAt?.toISOString(),
      createdAt: link.createdAt,
    };
  }

  @Get(':code')
  @ApiExcludeEndpoint()
  async redirect(@Param('code') code: string, @Res() res: Response, @Req() req: Request) {
    const requestId = req['requestId'];
    const link = await this.linkService.resolveAndTrack(
      code,
      req.ip,
      req.headers['user-agent'],
      req.headers['referer'],
      requestId,
    );
    return res.redirect(this.redirectStatus, link.originalUrl);
  }

  @Get('stats/:code')
  @ApiOperation({ summary: '[Public] Get click statistics for a short URL' })
  async getStats(@Param('code') code: string, @Req() req: Request): Promise<LinkStatsDto> {
    return this.linkService.getStats(code, req['requestId']);
  }
}
