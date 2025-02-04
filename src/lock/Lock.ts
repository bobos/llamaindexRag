import { RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

interface LockOptions {
  ttl?: number;
  retryDelay?: number;
  autoRenew?: boolean;
}

export class Lock extends EventEmitter {
  private readonly client: RedisClientType;
  private readonly baseKey: string;
  private readonly ttl: number;
  private readonly retryDelay: number;
  private readonly autoRenew: boolean;
  private token: string | null = null;
  private renewalInterval?: NodeJS.Timeout;
  private isReleased: boolean = false;
  
  constructor(client: RedisClientType, key: string, options: LockOptions = {}) {
    super();
    this.client = client;
    this.baseKey = `lock:${key}`;
    this.ttl = options.ttl || 30000;
    this.retryDelay = options.retryDelay || 100;
    this.autoRenew = options.autoRenew || false;
    
    if (this.ttl < 1000) {
      throw new Error('TTL must be at least 1000ms');
    }
  }

  async acquire(timeout: number = 10000): Promise<boolean> {
    if (this.token) throw new Error('Lock already acquired');
    this.isReleased = false;
    
    const start = Date.now();
    this.token = uuidv4();
    const lockKey = this.getLockKey();

    try {
      while (Date.now() - start < timeout && !this.isReleased) {
        if (!this.client.isOpen) {
          throw new Error('Redis connection is closed');
        }

        const result = await this.client.set(lockKey, this.token, {
          NX: true,
          PX: this.ttl
        });

        if (result === 'OK') {
          if (this.autoRenew) {
            this.startRenewal();
          }
          this.emit('acquired');
          return true;
        }

        await new Promise(res => setTimeout(res, this.retryDelay));
      }
      return false;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private getLockKey(): string {
    return `${this.baseKey}:${process.pid}`;
  }

  private async executeLuaScript(script: string, keys: string[], args: string[]): Promise<number> {
    try {
      if (!this.client.isOpen) {
        throw new Error('Redis connection is closed');
      }
      
      const result = await this.client.eval(script, {
        keys,
        arguments: args
      });
      
      return typeof result === 'number' ? result : 0;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private startRenewal(): void {
    if (this.renewalInterval) return;

    const renewalInterval = Math.floor(this.ttl * 0.75);
    this.renewalInterval = setInterval(async () => {
      if (!this.token || this.isReleased) return;
      
      try {
        const renewed = await this.renew();
        if (!renewed) {
          this.emit('lost');
          this.stopRenewal();
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, renewalInterval);
  }

  private stopRenewal(): void {
    if (this.renewalInterval) {
      clearInterval(this.renewalInterval);
      this.renewalInterval = undefined;
    }
  }

  async renew(): Promise<boolean> {
    if (!this.token) throw new Error('Lock not acquired');
    
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    
    const result = await this.executeLuaScript(script, [this.getLockKey()], 
      [this.token, this.ttl.toString()]);
    
    return result === 1;
  }

  async release(): Promise<boolean> {
    if (!this.token || this.isReleased) return false;
    
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;
    
    try {
      const result = await this.executeLuaScript(script, [this.getLockKey()], [this.token]);
      this.isReleased = true;
      this.token = null;
      this.stopRenewal();
      
      if (result === 1) {
        this.emit('released');
        return true;
      }
      return false;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async withLock<T>(fn: () => Promise<T>, timeout?: number): Promise<T> {
    const acquired = await this.acquire(timeout || this.ttl);
    if (!acquired) throw new Error('Failed to acquire lock');
    
    try {
      const result = await fn();
      return result;
    } finally {
      await this.release();
    }
  }

  isAcquired(): boolean {
    return this.token !== null && !this.isReleased;
  }
}
