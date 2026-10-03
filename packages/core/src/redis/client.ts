// SPDX-License-Identifier: Apache-2.0
/**
 * 100% Native Bun High-Performance Redis Client
 *
 * Built directly on Bun.connect and native TCP sockets implementing the
 * Redis Serialization Protocol (RESP2). Zero external npm dependencies.
 */
import type { Socket } from "bun";

export interface RedisOptions {
  hostname?: string | undefined;
  port?: number | undefined;
  timeoutMs?: number | undefined;
}

export class NativeRedisClient {
  #socket: Socket<unknown> | null = null;
  #queue: Array<{
    resolve: (val: any) => void;
    reject: (err: Error) => void;
  }> = [];
  #buffer: Uint8Array = new Uint8Array(0);
  #connected = false;
  readonly hostname: string;
  readonly port: number;

  constructor(options: RedisOptions = {}) {
    this.hostname = options.hostname ?? "127.0.0.1";
    this.port = options.port ?? 6379;
  }

  async connect(): Promise<this> {
    if (this.#connected && this.#socket) return this;

    return new Promise((resolve, reject) => {
      let resolved = false;

      Bun.connect({
        hostname: this.hostname,
        port: this.port,
        socket: {
          open: (sock) => {
            this.#socket = sock;
            this.#connected = true;
            resolved = true;
            resolve(this);
          },
          data: (_sock, data) => {
            this.#onData(data);
          },
          close: () => {
            this.#connected = false;
            this.#socket = null;
            this.#flushQueue(new Error("Redis connection closed"));
          },
          error: (_sock, error) => {
            if (!resolved) {
              resolved = true;
              reject(error);
            } else {
              this.#flushQueue(error instanceof Error ? error : new Error(String(error)));
            }
          },
        },
      }).catch((err) => {
        if (!resolved) reject(err);
      });
    });
  }

  get isConnected(): boolean {
    return this.#connected && this.#socket !== null;
  }

  #flushQueue(err: Error) {
    while (this.#queue.length > 0) {
      const item = this.#queue.shift();
      item?.reject(err);
    }
  }

  #onData(chunk: Uint8Array) {
    // Append chunk to buffer
    const next = new Uint8Array(this.#buffer.length + chunk.length);
    next.set(this.#buffer);
    next.set(chunk, this.#buffer.length);
    this.#buffer = next;

    this.#processBuffer();
  }

  #processBuffer() {
    while (this.#buffer.length > 0 && this.#queue.length > 0) {
      const parsed = this.#parseResp(this.#buffer);
      if (parsed === null) {
        // Need more data
        break;
      }

      this.#buffer = this.#buffer.subarray(parsed.offset);
      const pending = this.#queue.shift();
      if (pending) {
        if (parsed.isError) {
          pending.reject(new Error(parsed.value));
        } else {
          pending.resolve(parsed.value);
        }
      }
    }
  }

  #parseResp(buf: Uint8Array): { value: any; offset: number; isError: boolean } | null {
    if (buf.length < 3 || buf[0] === undefined) return null;
    const type = String.fromCharCode(buf[0]);

    // Find CRLF
    let crlf = -1;
    for (let i = 1; i < buf.length - 1; i++) {
      if (buf[i] === 13 && buf[i + 1] === 10) {
        crlf = i;
        break;
      }
    }
    if (crlf === -1) return null;

    const line = new TextDecoder().decode(buf.subarray(1, crlf));

    switch (type) {
      case "+": // Simple String
        return { value: line, offset: crlf + 2, isError: false };

      case "-": // Error
        return { value: line, offset: crlf + 2, isError: true };

      case ":": // Integer
        return { value: Number.parseInt(line, 10), offset: crlf + 2, isError: false };

      case "$": {
        // Bulk String
        const len = Number.parseInt(line, 10);
        if (len === -1) {
          return { value: null, offset: crlf + 2, isError: false };
        }
        const dataStart = crlf + 2;
        const dataEnd = dataStart + len;
        if (buf.length < dataEnd + 2) {
          // Waiting for full payload + CRLF
          return null;
        }
        const str = new TextDecoder().decode(buf.subarray(dataStart, dataEnd));
        return { value: str, offset: dataEnd + 2, isError: false };
      }

      case "*": {
        // Array
        const count = Number.parseInt(line, 10);
        if (count === -1) {
          return { value: null, offset: crlf + 2, isError: false };
        }
        let currentOffset = crlf + 2;
        const arr: any[] = [];

        for (let i = 0; i < count; i++) {
          if (currentOffset >= buf.length) return null;
          const element = this.#parseResp(buf.subarray(currentOffset));
          if (element === null) return null;
          arr.push(element.value);
          currentOffset += element.offset;
        }

        return { value: arr, offset: currentOffset, isError: false };
      }

      default:
        throw new Error(`Unknown RESP prefix: ${type}`);
    }
  }

  async sendCommand(command: string, ...args: Array<string | number>): Promise<any> {
    if (!this.#connected || !this.#socket) {
      await this.connect();
    }

    const allArgs = [command, ...args.map(String)];
    // Build RESP Array: *<len>\r\n$<l>\r\n<arg>\r\n...
    let payload = `*${allArgs.length}\r\n`;
    for (const arg of allArgs) {
      const bytes = Buffer.byteLength(arg);
      payload += `$${bytes}\r\n${arg}\r\n`;
    }

    return new Promise((resolve, reject) => {
      this.#queue.push({ resolve, reject });
      try {
        this.#socket?.write(payload);
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- High-Level Redis Commands ---

  async ping(): Promise<string> {
    return this.sendCommand("PING");
  }

  async set(key: string, value: string, exSeconds?: number): Promise<string> {
    if (exSeconds !== undefined && exSeconds > 0) {
      return this.sendCommand("SET", key, value, "EX", exSeconds);
    }
    return this.sendCommand("SET", key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.sendCommand("GET", key);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.sendCommand("DEL", ...keys);
  }

  async hset(
    key: string,
    fieldOrRecord: string | Record<string, string>,
    value?: string,
  ): Promise<number> {
    if (typeof fieldOrRecord === "object") {
      const pairs: string[] = [];
      for (const [f, v] of Object.entries(fieldOrRecord)) {
        pairs.push(f, String(v));
      }
      return this.sendCommand("HSET", key, ...pairs);
    }
    return this.sendCommand("HSET", key, fieldOrRecord, value ?? "");
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.sendCommand("HGET", key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const raw: string[] = (await this.sendCommand("HGETALL", key)) || [];
    const out: Record<string, string> = {};
    for (let i = 0; i < raw.length; i += 2) {
      const field = raw[i];
      const val = raw[i + 1];
      if (field !== undefined && val !== undefined) {
        out[field] = val;
      }
    }
    return out;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) return 0;
    return this.sendCommand("SADD", key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return (await this.sendCommand("SMEMBERS", key)) || [];
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.sendCommand("PUBLISH", channel, message);
  }

  async keys(pattern = "*"): Promise<string[]> {
    return (await this.sendCommand("KEYS", pattern)) || [];
  }

  async flushdb(): Promise<string> {
    return this.sendCommand("FLUSHDB");
  }

  close() {
    this.#connected = false;
    if (this.#socket) {
      try {
        this.#socket.end();
      } catch {
        // Ignore
      }
      this.#socket = null;
    }
    this.#flushQueue(new Error("Client explicitly closed"));
  }
}
