declare module "node:crypto" {
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  export function createHash(algorithm: string): {
    update(data: string | Uint8Array): {
      digest(): Uint8Array;
      digest(encoding: "hex"): string;
    };
  };
}
