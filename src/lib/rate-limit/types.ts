export interface RateLimiter {
  consume(key: string, points?: number): Promise<unknown>;
}

export interface RateLimitConfig {
  points: number;
  durationSeconds: number;
  tableName: string;
}
