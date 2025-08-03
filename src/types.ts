import type { Context } from 'hono'
import type { BrotliOptions, ZlibOptions } from 'node:zlib'
import type { IntClosedRange } from 'type-fest'

import type {
  ACCEPTED_ENCODINGS,
  BROTLI_MAX_LEVEL,
  BROTLI_MIN_LEVEL,
  GZIP_MAX_LEVEL,
  GZIP_MIN_LEVEL,
  NODE_ENCODINGS,
  ZSTD_MAX_LEVEL,
  ZSTD_MIN_LEVEL,
} from '~/constants'

export type CompressionEncoding = (typeof ACCEPTED_ENCODINGS)[number]

export type NodeCompressionEncoding = (typeof NODE_ENCODINGS)[number]
export type NodeCompressionOptions = BrotliOptions & ZlibOptions

export type CompressionFilter = (context: Context) => boolean

export type ZstdLevel = IntClosedRange<typeof ZSTD_MIN_LEVEL, typeof ZSTD_MAX_LEVEL>
export type BrotliLevel = IntClosedRange<
  typeof BROTLI_MIN_LEVEL,
  typeof BROTLI_MAX_LEVEL
>
export type GzipLevel = IntClosedRange<typeof GZIP_MIN_LEVEL, typeof GZIP_MAX_LEVEL>

export interface CompressOptions {
  encoding?: CompressionEncoding
  encodings?: CompressionEncoding[]
  force?: boolean
  threshold?: number
  zstdLevel?: ZstdLevel
  brotliLevel?: BrotliLevel
  gzipLevel?: GzipLevel
  options?: NodeCompressionOptions
  filter?: CompressionFilter
}