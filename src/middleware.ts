import type { Context, MiddlewareHandler } from 'hono'

import type { CompressionEncoding, CompressOptions } from '~/types'

import {
  ACCEPTED_ENCODINGS,
  BROTLI_DEFAULT_LEVEL,
  GZIP_DEFAULT_LEVEL,
  THRESHOLD_SIZE,
  ZSTD_DEFAULT_LEVEL,
} from '~/constants'
import {
  isCloudflareWorkers,
  isCompressible,
  isDenoDeploy,
  isTransformable,
} from '~/helpers'
import { brotli, zlib } from '~/imports'
import {
  BrotliCompressionStream,
  ZlibCompressionStream,
  ZstdCompressionStream,
} from '~/streams'

function validateEncodings(encodings: CompressionEncoding[]) {
  const unsupportedEncoding = encodings.find(
    (encoding) => !ACCEPTED_ENCODINGS.includes(encoding),
  )
  if (unsupportedEncoding) {
    throw new Error(`Unsupported encoding: ${unsupportedEncoding}.`)
  }
}

function findMatchingEncoding(
  context: Context,
  availableEncodings: CompressionEncoding[],
): CompressionEncoding | null {
  const acceptEncodingHeader = context.req.header('Accept-Encoding')
  if (!acceptEncodingHeader) {
    return null
  }
  return (
    availableEncodings.find((encoding) =>
      acceptEncodingHeader.includes(encoding),
    ) ?? null
  )
}

function createCompressionStream(
  encoding: CompressionEncoding,
  zstdLevel: number,
  brotliLevel: number,
  gzipLevel: number,
  options: any,
): { stream: any; isTransformStream: boolean } {
  if (encoding === 'zstd') {
    return { stream: new ZstdCompressionStream(zstdLevel), isTransformStream: true }
  }
  if (encoding === 'br' && brotli) {
    return { stream: new BrotliCompressionStream(brotliLevel), isTransformStream: false }
  }
  if (encoding === 'gzip' || encoding === 'deflate') {
    if (zlib) {
      return {
        stream: new ZlibCompressionStream(encoding, { level: gzipLevel, ...options }),
        isTransformStream: false,
      }
    }
    return { stream: new CompressionStream(encoding), isTransformStream: true }
  }
  return { stream: null, isTransformStream: false }
}

function shouldSkipCompression(
  context: Context,
  threshold: number,
  force: boolean,
  filter: any,
): boolean {
  if (!context.res.body || context.req.method === 'HEAD') return true
  if (context.res.headers.has('Content-Encoding')) return true
  
  const contentLength = Number(context.res.headers.get('Content-Length'))
  if (contentLength > 0 && contentLength < threshold) return true
  
  return (
    !isCompressible(context.res, force) ||
    !isTransformable(context.res) ||
    !!context.req.header('x-no-compression') ||
    (filter ? !filter(context) : isDenoDeploy || isCloudflareWorkers)
  )
}

export function compress({
  encoding,
  encodings = [...ACCEPTED_ENCODINGS],
  force = false,
  threshold = THRESHOLD_SIZE,
  zstdLevel = ZSTD_DEFAULT_LEVEL,
  brotliLevel = BROTLI_DEFAULT_LEVEL,
  gzipLevel = GZIP_DEFAULT_LEVEL,
  options = {},
  filter,
}: CompressOptions = {}): MiddlewareHandler {
  const activeEncodings = encoding ? [encoding] : encodings
  validateEncodings(activeEncodings)

  return async function compressionMiddleware(context, next) {
    await next()

    if (shouldSkipCompression(context, threshold, force, filter)) return

    const matchedEncoding =
      findMatchingEncoding(context, activeEncodings) ?? (force ? activeEncodings[0] : null)

    if (!matchedEncoding) return

    const { stream, isTransformStream } = createCompressionStream(
      matchedEncoding,
      zstdLevel,
      brotliLevel,
      gzipLevel,
      options,
    )

    if (!stream) return

    context.res = isTransformStream
      ? new Response(context.res.body!.pipeThrough(stream as TransformStream), context.res)
      : await context.res.body!.pipeTo(stream.writable).then(() => new Response(stream.readable, context.res))

    context.res.headers.delete('Content-Length')
    context.res.headers.set('Content-Encoding', matchedEncoding)
  }
}