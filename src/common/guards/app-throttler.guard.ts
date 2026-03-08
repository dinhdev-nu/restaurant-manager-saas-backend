import {
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModuleOptions, ThrottlerOptions, ThrottlerRequest, ThrottlerStorage } from '@nestjs/throttler';
import { Request } from 'express';
import { TooManyRequestException } from '../exceptions';
import { ERROR_CODE } from '../constants/error-code.constant';
import {
  APP_CUSTOM_THROTTLER_NAME,
  APP_CUSTOM_THROTTLER_LIMIT,
  APP_CUSTOM_THROTTLER_TTL,
  APP_CUSTOM_THROTTLER_BLOCK,
} from '../decorators/throttler/throttler.decorator';
import { sha256 } from '@nestjs/throttler/dist/hash';
import { THROTTLER_OPTIONS, THROTTLER_SKIP } from '@nestjs/throttler/dist/throttler.constants';

/**
 * AppThrottlerGuard
 *
 * Mở rộng ThrottlerGuard mặc định:
 *  1. getTracker()   – ưu tiên userId (nếu đã login) thay vì IP
 *                      → tránh trường hợp nhiều user sau NAT chung IP
 *  2. generateKey()  – throttler "global" dùng key chỉ gồm tracker (không kèm route)
 *                      → rate-limit toàn server, không phân biệt endpoint
 *  3. canActivate()  – luôn chạy global throttler TRƯỚC, rồi mới chạy
 *                      default hoặc custom throttler → global không bị bypass
 *  4. throwThrottlingException() – trả về response chuẩn dự án
 *  5. shouldSkip()   – bỏ qua throttle cho internal health-check routes
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {

  /**
   * Lưu ref đến throttlers config để dùng trong canActivate.
   */
  private throttlerOptions: ThrottlerOptions[];

  constructor(
    @Inject(THROTTLER_OPTIONS) options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
    // Lưu lại throttler config array
    const opts = Array.isArray(options) ? options : (options as any).throttlers ?? [];
    this.throttlerOptions = opts;
  }

  /**
   * Flow: skip check → global throttler (server-wide) → default/custom throttler (per-route).
   *
   * Global luôn được kiểm tra trước và KHÔNG thể bị bypass bởi default hay custom.
   * Custom/default sẽ giới hạn thêm ở mức per-route.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (await this.shouldSkip(context)) return true;

    const handler = context.getHandler();
    const classRef = context.getClass();

    // ── 1. Global throttler (server-wide) ────────────────────────────────
    // Kiểm tra @SkipThrottle({ global: true }) trước khi chạy
    const skipGlobal = this.reflector.getAllAndOverride<boolean>(
      THROTTLER_SKIP + 'global', [handler, classRef],
    );
    if (!skipGlobal) {
      const globalThrottler = this.throttlerOptions.find((t) => t.name === 'global');
      if (globalThrottler) {
        await this.handleRequest({
          context,
          limit: globalThrottler.limit,
          ttl: globalThrottler.ttl,
          blockDuration: globalThrottler.blockDuration ?? 0,
          throttler: globalThrottler,
          getTracker: (req) => this.getTracker(req as Request),
          generateKey: (ctx, tracker, name) => this.generateKey(ctx, tracker, name),
        } as ThrottlerRequest);
      }
    }

    // ── 2. Custom throttler (nếu có @ThrottleCustom) ─────────────────────
    const customName  = this.reflector.getAllAndOverride<string>(APP_CUSTOM_THROTTLER_NAME,  [handler, classRef]);
    const customLimit = this.reflector.getAllAndOverride<number>(APP_CUSTOM_THROTTLER_LIMIT, [handler, classRef]);
    const customTtl   = this.reflector.getAllAndOverride<number>(APP_CUSTOM_THROTTLER_TTL,   [handler, classRef]);
    const customBlock = this.reflector.getAllAndOverride<number>(APP_CUSTOM_THROTTLER_BLOCK, [handler, classRef]) ?? 0;

    if (customName && customLimit && customTtl) {
      await this.handleRequest({
        context,
        limit: customLimit,
        ttl: customTtl,
        blockDuration: customBlock,
        throttler: { name: customName, limit: customLimit, ttl: customTtl },
        getTracker: (req) => this.getTracker(req as Request),
        generateKey: (ctx, tracker, name) => this.generateKey(ctx, tracker, name),
      } as ThrottlerRequest);
      return true;
    }

    // ── 3. Default throttler (per-route) ─────────────────────────────────
    // Kiểm tra @SkipThrottle({ default: true }) trước khi chạy
    const skipDefault = this.reflector.getAllAndOverride<boolean>(
      THROTTLER_SKIP + 'default', [handler, classRef],
    );
    if (!skipDefault) {
      const defaultThrottler = this.throttlerOptions.find((t) => t.name === 'default');
      if (defaultThrottler) {
        await this.handleRequest({
          context,
          limit: defaultThrottler.limit,
          ttl: defaultThrottler.ttl,
          blockDuration: defaultThrottler.blockDuration ?? 0,
          throttler: defaultThrottler,
          getTracker: (req) => this.getTracker(req as Request),
          generateKey: (ctx, tracker, name) => this.generateKey(ctx, tracker, name),
        } as ThrottlerRequest);
      }
    }

    return true;
  }

  /**
   * Override generateKey:
   *  – Throttler "global": key = sha256("global-{tracker}")
   *    → đếm TOÀN BỘ request vào server, không phân biệt route
   *  – Các throttler khác: key = sha256("{Controller}-{handler}-{name}-{tracker}")
   *    → đếm per-route như mặc định
   */
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    if (name === 'global') {
      // Server-wide: chỉ dùng throttler name + tracker, bỏ controller/handler
      return sha256(`${name}-${suffix}`);
    }
    // Per-route: giữ logic mặc định (controller + handler + name + tracker)
    const prefix = `${context.getClass().name}-${context.getHandler().name}-${name}`;
    return sha256(`${prefix}-${suffix}`);
  }

  /**
   * Key dùng để track rate-limit.
   *  – Nếu request đã được xác thực: dùng userId  (chính xác hơn IP)
   *  – Nếu chưa xác thực:           dùng IP       (fallback)
   */
  protected async getTracker(req: Request): Promise<string> {
    const user = (req as any).user as { id?: string | number } | undefined;

    if (user?.id) {
      return `user:${user.id}`;
    }

    // Lấy real IP khi app đứng sau reverse proxy / load balancer
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])?.trim()
      ?? req.ip
      ?? 'unknown'
    );

    return `ip:${ip}`;
  }

  /**
   * Bỏ qua throttle cho một số route đặc biệt:
   *  – /health  (k8s liveness / readiness probe)
   *  – /metrics (Prometheus scrape)
   */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const skipPaths = ['/health', '/metrics'];

    if (skipPaths.includes(req.path)) {
      return true;
    }

    // Gọi logic skip gốc (xử lý @SkipThrottle decorator)
    return super.shouldSkip(context);
  }

  /**
   * Trả về lỗi chuẩn theo format BaseResponseDto của dự án.
   * Thêm header Retry-After để client / browser biết khi nào thử lại.
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: {
      limit: number;
      ttl: number;
      key: string;
      tracker: string;
      totalHits: number;
      timeToExpire: number;
      isBlocked: boolean;
      timeToBlockExpire: number;
      throttlerName: string;
    },
  ): Promise<void> {
    const response = context.switchToHttp().getResponse();
    const isHardBlocked = throttlerLimitDetail.isBlocked && throttlerLimitDetail.timeToBlockExpire > 0;
    const retryAfter = isHardBlocked
      ? throttlerLimitDetail.timeToBlockExpire
      : throttlerLimitDetail.timeToExpire;

    response.header('Retry-After', retryAfter);
    response.header('X-RateLimit-Limit', throttlerLimitDetail.limit);
    response.header('X-RateLimit-Remaining', 0);
    response.header('X-RateLimit-Reset', retryAfter);

    throw new TooManyRequestException(
      ERROR_CODE.TOO_MANY_REQUESTS,
      "Quá nhiều yêu cầu",
      isHardBlocked
          ? `Bạn đã bị tạm khóa. Thử lại sau ${retryAfter} giây.`
          : `Quá nhiều yêu cầu. Vui lòng thử lại sau ${retryAfter} giây.`,
    );
  }
}