import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Res,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { LinkService } from './link.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { LinkResponseDto, LinkStatsDto } from './dto/link-response.dto';
import { RateLimit } from '../common/decorators/rate-limit.decorator';

@ApiTags('Links')
@Controller()
export class LinkController {
  constructor(private readonly linkService: LinkService) {}

  @Post('shorten')
  @ApiOperation({ summary: 'Create a shortened URL' })
  @RateLimit(60, 10)
  async create(@Body() dto: CreateLinkDto): Promise<LinkResponseDto> {
    const link = await this.linkService.create(dto);
    return {
      id: link.id,
      shortCode: link.shortCode,
      originalUrl: link.originalUrl,
      shortUrl: this.linkService.getFullShortUrl(link.shortCode),
      clickCount: link.clickCount,
      expiresAt: link.expiresAt?.toISOString(),
      createdAt: link.createdAt,
    };
  }

  @Get('links')
  @ApiOperation({ summary: 'List all shortened URLs' })
  async findAll(): Promise<LinkResponseDto[]> {
    const links = await this.linkService.findAll();
    return links.map((link) => ({
      id: link.id,
      shortCode: link.shortCode,
      originalUrl: link.originalUrl,
      shortUrl: this.linkService.getFullShortUrl(link.shortCode),
      clickCount: link.clickCount,
      expiresAt: link.expiresAt?.toISOString(),
      createdAt: link.createdAt,
    }));
  }

  @Get('stats/:code')
  @ApiOperation({ summary: 'Get click statistics for a short URL' })
  async getStats(@Param('code') code: string): Promise<LinkStatsDto> {
    return this.linkService.getStats(code);
  }

  @Delete('links/:id')
  @ApiOperation({ summary: 'Delete a shortened URL' })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.linkService.delete(id);
  }

  @Get(':code')
  @ApiExcludeEndpoint()
  async redirect(
    @Param('code') code: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const link = await this.linkService.resolveAndTrack(
      code,
      req.ip,
      req.headers['user-agent'],
      req.headers['referer'],
    );
    return res.redirect(301, link.originalUrl);
  }
}
