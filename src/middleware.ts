import type { MiddlewareHandler } from 'hono'
import { Duplex } from 'node:stream'
import { constants, createBrotliCompress, createDeflate, createGzip } from 'node:zlib'
import type { CompressionEncoding, HonoCompressOptions } from './types'
import { ACCEPTED_ENCODINGS, getEncoding, isCompressible, shouldCompress } from './utils'

const TRANSFER_ENCODING_REGEX = /(?:compress|gzip|deflate)/

const createStream = (encoding: CompressionEncoding, options: any) => {
  if (encoding === 'zstd') {
    return new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(Bun.zstdCompressSync(chunk, options))
      },
    })
  }

  let stream
  if (encoding === 'br') {
    stream = createBrotliCompress(options)
  } else if (encoding === 'gzip') {
    stream = createGzip(options)
  } else if (encoding === 'deflate') {
    stream = createDeflate(options)
  }

  if (stream) {
    return Duplex.toWeb(stream) as any
  }

  throw new Error(`Unsupported encoding: ${encoding}`)
}

export const compress = (opts: HonoCompressOptions = {}): MiddlewareHandler => {
  const {
    encodings = ACCEPTED_ENCODINGS,
    threshold = 1024,
    streaming = true,
    strict = true,
    force = false,
    filter,
    fallback,
    encoding: optsEncoding,
  } = opts

  const encodingOptions: Record<CompressionEncoding, any> = {
    br: {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: opts.brotliLevel ?? 4,
        ...opts.brotliOptions?.params,
      },
      ...opts.brotliOptions,
    },
    gzip: { level: opts.gzipLevel ?? 6, ...opts.gzipOptions },
    deflate: { level: opts.deflateLevel ?? 6, ...opts.deflateOptions },
    zstd: { level: opts.zstdLevel, ...opts.zstdOptions },
  }

  return async (c, next) => {
    await next()

    const { req, res } = c
    const { headers } = res

    if (req.method === 'HEAD' || !res.body) {
      return
    }

    if (strict && req.header('x-no-compression')) {
      return
    }

    if (headers.has('Content-Encoding') || TRANSFER_ENCODING_REGEX.test(headers.get('Transfer-Encoding') || '')) {
      return
    }

    if (!force) {
      if (!isCompressible(headers.get('Content-Type'))) {
        return
      }
      if (headers.get('Cache-Control')?.includes('no-transform')) {
        return
      }
    }

    if (!shouldCompress(res, threshold)) {
      return
    }

    if (filter && !filter(c)) {
      return
    }

    const vary = headers.get('Vary')
    if (!vary) {
      headers.set('Vary', 'Accept-Encoding')
    } else if (!vary.toLowerCase().includes('accept-encoding')) {
      headers.append('Vary', 'Accept-Encoding')
    }

    const encoding = optsEncoding ?? getEncoding(req.header('Accept-Encoding'), encodings) ?? fallback
    if (!encoding) {
      return
    }

    headers.set('Content-Encoding', encoding)
    headers.delete('Content-Length')

    const etag = headers.get('ETag')
    if (etag && !etag.startsWith('W/')) {
      headers.set('ETag', `W/${etag}`)
    }

    const stream = createStream(encoding, encodingOptions[encoding])
    const compressedBody = res.body.pipeThrough(stream)

    if (streaming) {
      c.res = new Response(compressedBody, res)
    } else {
      const buffer = await new Response(compressedBody).arrayBuffer()
      headers.set('Content-Length', buffer.byteLength.toString())
      c.res = new Response(buffer, res)
    }
  }
}