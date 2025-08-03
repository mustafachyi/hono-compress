import type { BrotliWasmType } from 'brotli-wasm'

export const brotli: BrotliWasmType | null = await import('brotli-wasm')
  .then(async (module) => await module.default)
  .catch(() => null)

export const zlib = await import('node:zlib').catch(() => null)