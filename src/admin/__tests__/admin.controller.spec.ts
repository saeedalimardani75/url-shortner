import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AdminController } from '../admin.controller';
import { LinkService } from '../../link/link.service';
import { AuthService } from '../../auth/auth.service';
import { ApiKeyRole } from '../../auth/entities/api-key.entity';

describe('AdminController', () => {
  let controller: AdminController;

  const mockLink = {
    id: 1,
    shortCode: 'abc123',
    originalUrl: 'https://example.com',
    clickCount: 0,
    isActive: true,
    expiresAt: undefined,
    deletedAt: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    clicks: [],
  };

  const mockApiKeyResponse = {
    plainKey: 'sk_live_abc123',
    apiKey: {
      id: 1,
      name: 'test-key',
      role: 'admin',
      isActive: true,
      expiresAt: undefined,
      createdAt: new Date(),
    },
  };

  const mockLinkService = {
    findAllPaginated: jest.fn().mockResolvedValue({
      items: [mockLink],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    }),
    create: jest.fn().mockResolvedValue(mockLink),
    findOne: jest.fn().mockResolvedValue(mockLink),
    softDelete: jest.fn().mockResolvedValue(undefined),
    restore: jest.fn().mockResolvedValue(undefined),
    toggleActive: jest.fn().mockResolvedValue(undefined),
    getFullShortUrl: jest.fn().mockReturnValue('http://localhost:3000/abc123'),
  };

  const mockAuthService = {
    createApiKey: jest.fn().mockResolvedValue(mockApiKeyResponse),
    findAll: jest
      .fn()
      .mockResolvedValue({ items: [mockApiKeyResponse.apiKey], total: 1, page: 1, limit: 50, totalPages: 1 }),
    rotateApiKey: jest.fn().mockResolvedValue(mockApiKeyResponse),
    updateKeyStatus: jest.fn().mockResolvedValue(undefined),
    updateKeyExpiration: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('http://localhost:3000'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: LinkService, useValue: mockLinkService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listLinks', () => {
    it('should return paginated links', async () => {
      const result = await controller.listLinks(1, 20);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockLinkService.findAllPaginated).toHaveBeenCalledWith(1, 20);
    });

    it('should cap limit at 100', async () => {
      await controller.listLinks(1, 200);
      expect(mockLinkService.findAllPaginated).toHaveBeenCalledWith(1, 100);
    });
  });

  describe('createLink', () => {
    it('should create a link', async () => {
      const dto = { originalUrl: 'https://example.com' };
      const result = await controller.createLink(dto);
      expect(result.shortCode).toBe('abc123');
      expect(mockLinkService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('getLink', () => {
    it('should return a link by id', async () => {
      const result = await controller.getLink(1);
      expect(result.shortCode).toBe('abc123');
      expect(mockLinkService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('deleteLink', () => {
    it('should soft delete a link', async () => {
      await controller.deleteLink(1);
      expect(mockLinkService.softDelete).toHaveBeenCalledWith(1);
    });
  });

  describe('restoreLink', () => {
    it('should restore a link', async () => {
      await controller.restoreLink(1);
      expect(mockLinkService.restore).toHaveBeenCalledWith(1);
    });
  });

  describe('toggleLink', () => {
    it('should enable a link', async () => {
      await controller.toggleLink(1, 'true');
      expect(mockLinkService.toggleActive).toHaveBeenCalledWith(1, true);
    });

    it('should disable a link', async () => {
      await controller.toggleLink(1, 'false');
      expect(mockLinkService.toggleActive).toHaveBeenCalledWith(1, false);
    });
  });

  describe('createApiKey', () => {
    it('should create an API key', async () => {
      const dto = { name: 'new-key', role: ApiKeyRole.ADMIN };
      const result = await controller.createApiKey(dto);
      expect(result.plainKey).toBe('sk_live_abc123');
      expect(mockAuthService.createApiKey).toHaveBeenCalledWith(dto);
    });
  });

  describe('listApiKeys', () => {
    it('should return paginated API keys', async () => {
      const result = await controller.listApiKeys(1, 50);
      expect(result.items).toHaveLength(1);
      expect(mockAuthService.findAll).toHaveBeenCalledWith(1, 50);
    });
  });

  describe('rotateApiKey', () => {
    it('should rotate an API key', async () => {
      const result = await controller.rotateApiKey(1);
      expect(result.plainKey).toBe('sk_live_abc123');
      expect(mockAuthService.rotateApiKey).toHaveBeenCalledWith(1);
    });
  });

  describe('toggleApiKeyStatus', () => {
    it('should toggle API key status', async () => {
      await controller.toggleApiKeyStatus(1, 'false');
      expect(mockAuthService.updateKeyStatus).toHaveBeenCalledWith(1, false);
    });
  });

  describe('updateApiKeyExpiration', () => {
    it('should update API key expiration', async () => {
      const date = '2027-12-31T23:59:59.000Z';
      await controller.updateApiKeyExpiration(1, date);
      expect(mockAuthService.updateKeyExpiration).toHaveBeenCalledWith(1, date);
    });
  });

  describe('deleteApiKey', () => {
    it('should delete an API key', async () => {
      await controller.deleteApiKey(1);
      expect(mockAuthService.delete).toHaveBeenCalledWith(1);
    });
  });
});
