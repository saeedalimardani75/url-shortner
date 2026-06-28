import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Param,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LinkService } from '../link/link.service';
import { AuthService } from '../auth/auth.service';
import { CreateLinkDto } from '../link/dto/create-link.dto';
import { CreateApiKeyDto } from '../auth/dto/create-api-key.dto';
import { LinkResponseDto, PaginatedLinksDto } from '../link/dto/link-response.dto';

@ApiTags('Admin')
@ApiBearerAuth('x-api-key')
@UseGuards(ApiKeyGuard, RolesGuard)
@Roles('admin', 'customer')
@Controller('admin')
export class AdminController {
  private readonly baseUrl: string;

  constructor(
    private readonly linkService: LinkService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('app.baseUrl', 'http://localhost:3000');
  }

  @Get('links')
  @ApiOperation({ summary: '[Admin] List all shortened URLs (paginated)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async listLinks(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<PaginatedLinksDto> {
    const result = await this.linkService.findAllPaginated(page, Math.min(limit, 100));
    return {
      ...result,
      items: result.items.map((link) => ({
        id: link.id,
        shortCode: link.shortCode,
        originalUrl: link.originalUrl,
        shortUrl: this.linkService.getFullShortUrl(link.shortCode, this.baseUrl),
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
      shortUrl: this.linkService.getFullShortUrl(link.shortCode, this.baseUrl),
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
      shortUrl: this.linkService.getFullShortUrl(link.shortCode, this.baseUrl),
      clickCount: link.clickCount,
      isActive: link.isActive,
      expiresAt: link.expiresAt?.toISOString(),
      createdAt: link.createdAt,
      deletedAt: link.deletedAt?.toISOString(),
    };
  }

  @Delete('links/:id')
  @ApiOperation({ summary: '[Admin] Soft delete a shortened URL' })
  async deleteLink(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.linkService.softDelete(id);
  }

  @Put('links/:id/restore')
  @ApiOperation({ summary: '[Admin] Restore a soft-deleted URL' })
  async restoreLink(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.linkService.restore(id);
  }

  @Put('links/:id/toggle')
  @ApiOperation({ summary: '[Admin] Enable or disable a link' })
  @ApiQuery({ name: 'active', required: true, example: true })
  async toggleLink(@Param('id', ParseIntPipe) id: number, @Query('active') active: string): Promise<void> {
    await this.linkService.toggleActive(id, active === 'true');
  }

  @Post('api-keys')
  @Roles('admin')
  @ApiOperation({ summary: '[Admin] Create a new API key' })
  async createApiKey(@Body() dto: CreateApiKeyDto) {
    return this.authService.createApiKey(dto);
  }

  @Get('api-keys')
  @Roles('admin')
  @ApiOperation({ summary: '[Admin] List all API keys (paginated)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  async listApiKeys(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.authService.findAll(page, Math.min(limit, 100));
  }

  @Put('api-keys/:id/rotate')
  @Roles('admin')
  @ApiOperation({ summary: '[Admin] Rotate an API key' })
  async rotateApiKey(@Param('id', ParseIntPipe) id: number) {
    return this.authService.rotateApiKey(id);
  }

  @Put('api-keys/:id/status')
  @Roles('admin')
  @ApiOperation({ summary: '[Admin] Activate/deactivate an API key' })
  @ApiQuery({ name: 'active', required: true, example: true })
  async toggleApiKeyStatus(@Param('id', ParseIntPipe) id: number, @Query('active') active: string): Promise<void> {
    await this.authService.updateKeyStatus(id, active === 'true');
  }

  @Put('api-keys/:id/expiration')
  @Roles('admin')
  @ApiOperation({ summary: '[Admin] Update API key expiration' })
  @ApiQuery({ name: 'expiresAt', required: false, example: '2027-12-31T23:59:59.000Z' })
  async updateApiKeyExpiration(
    @Param('id', ParseIntPipe) id: number,
    @Query('expiresAt') expiresAt?: string,
  ): Promise<void> {
    await this.authService.updateKeyExpiration(id, expiresAt || null);
  }

  @Delete('api-keys/:id')
  @Roles('admin')
  @ApiOperation({ summary: '[Admin] Delete an API key' })
  async deleteApiKey(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.authService.delete(id);
  }
}
