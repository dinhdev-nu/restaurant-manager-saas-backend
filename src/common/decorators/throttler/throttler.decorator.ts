import { SkipThrottle as _OriginalSkipThrottle } from '@nestjs/throttler';

export const APP_CUSTOM_THROTTLER_NAME = 'APP:THROTTLER:CUSTOM:NAME';
export const APP_CUSTOM_THROTTLER_LIMIT = 'APP:THROTTLER:CUSTOM:LIMIT';
export const APP_CUSTOM_THROTTLER_TTL = 'APP:THROTTLER:CUSTOM:TTL';
export const APP_CUSTOM_THROTTLER_BLOCK = 'APP:THROTTLER:CUSTOM:BLOCK_DURATION';

// Custom throttler: use a unique name for per-route rate limiting.
// AppThrottlerGuard reads these metadata keys FIRST.
// When found, only the custom throttler applies (global/default are skipped).
// Example:
//   @ThrottleCustom('register',    { ttl: 60_000, limit: 5  })
//   @ThrottleCustom('check-email', { ttl: 60_000, limit: 20 })
export const ThrottleCustom = (
  name: string,
  options: { ttl: number; limit: number; blockDuration?: number },
) => {
  return (
    target: object,
    _propertyKey?: string | symbol,
    descriptor?: TypedPropertyDescriptor<any>,
  ) => {
    const ref = descriptor?.value ?? target;
    Reflect.defineMetadata(APP_CUSTOM_THROTTLER_NAME, name, ref);
    Reflect.defineMetadata(APP_CUSTOM_THROTTLER_LIMIT, options.limit, ref);
    Reflect.defineMetadata(APP_CUSTOM_THROTTLER_TTL, options.ttl, ref);
    Reflect.defineMetadata(APP_CUSTOM_THROTTLER_BLOCK, options.blockDuration ?? 0, ref);
    return descriptor ?? target;
  };
};

// Wrap SkipThrottle gốc: mặc định skip TẤT CẢ throttler (global + default)
// NestJS mặc định chỉ skip "default", không skip "global"
export const SkipThrottle = (
  skip: Record<string, boolean> = { global: true, default: true },
) => _OriginalSkipThrottle(skip);
