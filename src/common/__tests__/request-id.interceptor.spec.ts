import { RequestIdInterceptor } from '../interceptors/request-id.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('RequestIdInterceptor', () => {
  let interceptor: RequestIdInterceptor;

  beforeEach(() => {
    interceptor = new RequestIdInterceptor();
  });

  it('should add requestId to request', (done) => {
    const mockRequest: any = { headers: {} };
    const mockResponse: any = { setHeader: jest.fn() };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as ExecutionContext;

    const mockNext: CallHandler = { handle: () => of('test') };

    interceptor.intercept(mockContext, mockNext).subscribe(() => {
      expect(mockRequest.requestId).toBeDefined();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('x-request-id', mockRequest.requestId);
      done();
    });
  });

  it('should use existing x-request-id header', (done) => {
    const mockRequest: any = { headers: { 'x-request-id': 'existing-id' } };
    const mockResponse: any = { setHeader: jest.fn() };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as ExecutionContext;

    const mockNext: CallHandler = { handle: () => of('test') };

    interceptor.intercept(mockContext, mockNext).subscribe(() => {
      expect(mockRequest.requestId).toBe('existing-id');
      done();
    });
  });
});
