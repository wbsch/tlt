declare module 'pako' {
  export class Inflate {
    constructor(options?: {
      chunkSize?: number;
      raw?: boolean;
      to?: string;
      windowBits?: number;
    });
    err: number;
    msg: string;
    onData(chunk: Uint8Array | string): void;
    push(data: Uint8Array, mode?: boolean | number): boolean;
    result?: Uint8Array | string;
  }
  export function deflateRaw(data: Uint8Array): Uint8Array;
  export function inflateRaw(data: Uint8Array): Uint8Array;
}
