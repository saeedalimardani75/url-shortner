import { Controller, Get, Post, Delete, Put, Param, Query, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LinkService } from '../link/link.service';
import { AuthService } from '../auth/auth.service';
import { CreateLinkDto } from '../link/dto/create-link.dto';
import { CreateApiKeyDto } from '../auth/dto/create-api-key.dto';
import { LinkResponseDto, PaginatedLinksDto } from '../link/dto/link-response.dto';

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

@ApiTags('Admin')
@ApiBearerAuth('x-api-key')
@UseGuards(ApiKeyGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly linkService: LinkService,
    private readonly authService: AuthService,
  ) {}

  @Get('links')
  @ApiOperation({ summary: '[Admin] List all shortened URLs (paginated)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async listLinks(@Query('page') page = 1, @Query('limit') limit = 20): Promise<PaginatedLinksDto> {
    const result = await this.linkService.findAllPaginated(+page, Math.min(+limit, 100));
    return {
      ...result,
      items: result.items.map((link) => ({
        id: link.id,
        shortCode: link.shortCode,
        originalUrl: link.originalUrl,
        shortUrl: this.linkService.getFullShortUrl(link.shortCode, BASE_URL),
        clickCount: link.clickCount,
        isActive: link.isActive,
        expiresAt: link.expiresAt?.toISOString(),
        createdAt: link.createdAt,
        deletedAt: link.deletedAt?.toISOString(),
      })),
    };
  }

  @Post('links')
  @ApiOperation({ summary: '[Admin] Create a shortened URL' })
  async createLink(@Body() dto: CreateLinkDto): Promise<LinkResponseDto> {
    const link = await this.linkService.create(dto);
    return {
      id: link.id,
      shortCode: link.shortCode,
      originalUrl: link.originalUrl,
      shortUrl: this.linkService.getFullShortUrl(link.shortCode, BASE_URL),
      clickCount: link.clickCount,
      isActive: link.isActive,
      expiresAt: link.expiresAt?.toISOString(),
      createdAt: link.createdAt,
    };
  }

  @Get('links/:id')
  @ApiOperation({ summary: '[Admin] Get link by ID' })
  async getLink(@Param('id', ParseIntPipe) id: number): Promise<LinkResponseDto> {
    const link = await this.linkService.findOne(id);
    return {
      id: link.id,
      shortCode: link.shortCode,
      originalUrl: link.originalUrl,
      shortUrl: this.linkService.getFullShortUrl(link.shortCode, BASE_URL),
      clickCount: link.clickCount,
      isActive: link.isActive,
      expiresAt: link.expiresAt?.toISOString(),
      createdAt: link.createdAt,
      deletedAt: link.deletedAt?.toISOString(),
    };
  }

  @Delete('links/:id')
  @ApiOperation({ summary: '[Admin] Soft delete a shortened URL' })
  deleteLink(@Param('id', ParseIntPipe) id: number) {
    return this.linkService.softDelete(id);
  }

  @Put('links/:id/restore')
  @ApiOperation({ summary: '[Admin] Restore a soft-deleted URL' })
  restoreLink(@Param('id', ParseIntPipe) id: number) {
    return this.linkService.restore(id);
  }

  @Put('links/:id/toggle')
  @ApiOperation({ summary: '[Admin] Enable or disable a link' })
  @ApiQuery({ name: 'active', required: true, example: true })
  toggleLink(@Param('id', ParseIntPipe) id: number, @Query('active') active: string) {
    return this.linkService.toggleActive(id, active === 'true');
  }

  @Post('api-keys')
  @ApiOperation({ summary: '[Admin] Create a new API key' })
  createApiKey(@Body() dto: CreateApiKeyDto) {
    return this.authService.createApiKey(dto);
  }

  @Get('api-keys')
  @ApiOperation({ summary: '[Admin] List all API keys' })
  listApiKeys() {
    return this.authService.findAll();
  }

  @Put('api-keys/:id/rotate')
  @ApiOperation({ summary: '[Admin] Rotate an API key' })
  rotateApiKey(@Param('id', ParseIntPipe) id: number) {
    return this.authService.rotateApiKey(id);
  }

  @Put('api-keys/:id/status')
  @ApiOperation({ summary: '[Admin] Activate/deactivate an API key' })
  @ApiQuery({ name: 'active', required: true, example: true })
  toggleApiKeyStatus(@Param('id', ParseIntPipe) id: number, @Query('active') active: string) {
    return this.authService.updateKeyStatus(id, active === 'true');
  }

  @Put('api-keys/:id/expiration')
  @ApiOperation({ summary: '[Admin] Update API key expiration' })
  @ApiQuery({ name: 'expiresAt', required: false, example: '2027-12-31T23:59:59.000Z' })
  updateApiKeyExpiration(@Param('id', ParseIntPipe) id: number, @Query('expiresAt') expiresAt?: string) {
    return this.authService.updateKeyExpiration(id, expiresAt || null);
  }

  @Delete('api-keys/:id')
  @ApiOperation({ summary: '[Admin] Delete an API key' })
  deleteApiKey(@Param('id', ParseIntPipe) id: number) {
    return this.authService.delete(id);
  }
}
