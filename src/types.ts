import type { Context } from 'hono'
import type { BrotliOptions, ZlibOptions } from 'node:zlib'

export type CompressionEncoding = 'gzip' | 'deflate' | 'br' | 'zstd'

export interface HonoCompressOptions {
  encoding?: CompressionEncoding
  encodings?: CompressionEncoding[]
  fallback?: CompressionEncoding
  force?: boolean
  strict?: boolean
  threshold?: number
  streaming?: boolean
  filter?: (c: Context) => boolean
  zstdLevel?: number
  zstdOptions?: any
  brotliLevel?: number
  brotliOptions?: BrotliOptions
  gzipLevel?: number
  gzipOptions?: ZlibOptions
  deflateLevel?: number
  deflateOptions?: ZlibOptions
}