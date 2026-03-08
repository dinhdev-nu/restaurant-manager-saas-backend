import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';
import { INJECTION_TOKEN } from 'src/common/constants/injection-token.constant';

/**
 * ThrottlerStorageRedisService
 *
 * Custom Redis storage cho @nestjs/throttler.
 * Dùng ioredis (đã có sẵn trong dự án, KHÔNG cài thêm).
 *
 * ── Key format ────────────────────────────────────────────────────────────
 *
 *   ratelimit:{throttlerName}:{tracker}
 *
 *   throttlerName = tên throttler đăng ký trong ThrottlerModule:
 *     global, default, register, check-email, ...
 *
 *   key = SHA256 hash do ThrottlerGuard.generateKey() tạo:
 *     sha256("{ControllerName}-{handlerName}-{throttlerName}-{tracker}") 
 *
 *   tracker (trước khi hash) do AppThrottlerGuard.getTracker() tạo:
 *     ip:{ipAddress}   – chưa xác thực  
 *     user:{userId}    – đã xác thực
 * 
 *   Ví dụ thực tế (POST /auth/login từ IP 1.2.3.4):
 *     ratelimit:global:sha256("AuthController-login-global-ip:1.2.3.4")
 *     ratelimit:default:sha256("AuthController-login-default-ip:1.2.3.4")
 *
 *   Ví dụ custom (POST /auth/register):
 *     ratelimit:register:sha256("AuthController-getUser-register-ip:1.2.3.4")
 *
 *   Block key (khi blockDuration > 0): 
 *     ratelimit:block:{throttlerName}:{sha256key}
 *     ratelimit:block:global:sha256("AuthController-login-global-ip:1.2.3.4")
 *
 * ── Lua script ────────────────────────────────────────────────────────────
 *   Atomic INCR + PEXPIRE trong 1 round-trip → không bị race condition.
 */
@Injectable()
export class ThrottlerStorageRedisService
  implements ThrottlerStorage
{

  /** Prefix cố định cho toàn bộ rate-limit key */
  private readonly KEY_PREFIX = 'ratelimit';

  /**
   * Lua script – atomic INCR + PEXPIRE.
   * KEYS[1] = full redis key
   * ARGV[1] = ttl (ms)
   * Returns [hits, pttl]
   */
  private readonly LUA_SCRIPT = `
    local key  = KEYS[1]
    local ttl  = tonumber(ARGV[1])
    local hits = redis.call('INCR', key)
    if hits == 1 then
      redis.call('PEXPIRE', key, ttl)
    end
    local pttl = redis.call('PTTL', key)
    return { hits, pttl }
  `;

  constructor(@Inject(INJECTION_TOKEN.REDIS_CLIENT) private readonly client: Redis) {}

  // ── Key builders ──────────────────────────────────────────────────────────

  /**
   * Key chính dùng để đếm hits.
   *
   * Pattern: ratelimit:{throttlerName}:{sha256key}
   *
   * throttlerName examples : global | default | register | check-email
   * sha256key              : SHA256("ControllerName-handlerName-throttlerName-tracker")
   *
   * Result examples:
   *   ratelimit:global:a3f1...   ← sha256("AuthController-login-global-ip:1.2.3.4")
   *   ratelimit:register:b7c2... ← sha256("AuthController-getUser-register-ip:1.2.3.4")
   *   ratelimit:default:e9d4...  ← sha256("AuthController-login-default-user:42")
   */
  private buildKey(throttlerName: string, tracker: string): string {
    return `${this.KEY_PREFIX}:${throttlerName}:${tracker}`;
  }

  /**
   * Key để block client sau khi vượt limit.
   *
   * Pattern: ratelimit:block:{throttlerName}:{sha256key}
   *
   * Result examples:
   *   ratelimit:block:global:a3f1...   ← sha256("AuthController-login-global-ip:1.2.3.4")
   *   ratelimit:block:register:b7c2... ← sha256("AuthController-getUser-register-ip:1.2.3.4")
   */
  private buildBlockKey(throttlerName: string, tracker: string): string {
    return `${this.KEY_PREFIX}:block:${throttlerName}:${tracker}`;
  }

  // ── ThrottlerStorage interface ────────────────────────────────────────────

  /**
   * Được ThrottlerGuard gọi tự động mỗi request.
   *
   * @param key           SHA256 hash do ThrottlerGuard.generateKey() tạo
   *                      = sha256("{ControllerName}-{handlerName}-{throttlerName}-{tracker}")
   * @param ttl           window size (ms)
   * @param limit         số request tối đa trong window
   * @param blockDuration ms bị ban thêm khi vượt limit (0 = không ban)
   * @param throttlerName tên throttler: global | default | strict | relaxed | register | ...
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = this.buildKey(throttlerName, key);
    const blockKey = this.buildBlockKey(throttlerName, key);

    // ── 1. Kiểm tra block ─────────────────────────────────────────────────
    if (blockDuration > 0) {
      const blockPTTL = await this.client.pttl(blockKey);
      if (blockPTTL > 0) {
        return {
          totalHits: limit + 1,
          timeToExpire: Math.ceil(blockPTTL / 1000),
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockPTTL / 1000),
        };
      }
    }

    // ── 2. Atomic increment ───────────────────────────────────────────────
    const [totalHits, remainingPTTL] = (await this.client.eval(
      this.LUA_SCRIPT,
      1,
      redisKey,
      ttl.toString(),
    )) as [number, number];

    const timeToExpire = Math.ceil(
      (remainingPTTL > 0 ? remainingPTTL : ttl) / 1000,
    );
    const isBlocked = totalHits > limit;

    // ── 3. Set block key khi vừa vượt limit ──────────────────────────────
    let timeToBlockExpire = 0;

    if (isBlocked && blockDuration > 0) {
      if (totalHits === limit + 1) {
        // Chỉ set block key đúng 1 lần (hits chạm limit + 1)
        await this.client.set(blockKey, '1', 'PX', blockDuration);
        timeToBlockExpire = Math.ceil(blockDuration / 1000);

      } else {
        const bpttl = await this.client.pttl(blockKey);
        timeToBlockExpire = bpttl > 0 ? Math.ceil(bpttl / 1000) : 0;
      }
    }

    return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
  }
}