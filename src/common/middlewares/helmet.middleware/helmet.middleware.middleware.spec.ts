import { HelmetMiddlewareMiddleware } from './helmet.middleware.middleware';

describe('HelmetMiddlewareMiddleware', () => {
  it('should be defined', () => {
    expect(new HelmetMiddlewareMiddleware()).toBeDefined();
  });
});
