import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateApiKeyDto, ApiKeyRole } from './dto/create-api-key.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('api-keys')
  @ApiOperation({ summary: 'Create a new API key' })
  create(@Body() dto: CreateApiKeyDto) {
    return this.authService.createApiKey(dto);
  }

  @Get('api-keys')
  @ApiOperation({ summary: 'List all API keys' })
  findAll() {
    return this.authService.findAll();
  }

  @Delete('api-keys/:id')
  @ApiOperation({ summary: 'Delete an API key' })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.authService.delete(id);
  }
}
