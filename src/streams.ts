import type { Duplex } from 'node:stream'

import zstd from '@mongodb-js/zstd'
import { Buffer } from 'node:buffer'

import type { NodeCompressionEncoding, NodeCompressionOptions } from '~/types'

import { brotli, zlib } from '~/imports'

export class ZstdCompressionStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(level?: number) {
    super({
      async transform(chunk, controller) {
        try {
          const compressedChunk = await zstd.compress(Buffer.from(chunk), level)
          controller.enqueue(compressedChunk)
        } catch (error) {
          controller.error(error)
        }
      },
    })
  }
}

export class BrotliCompressionStream {
  readonly readable: ReadableStream
  readonly writable: WritableStream

  constructor(_level?: number) {
    const compressor = new (brotli as any).CompressStream()
    let controller: ReadableStreamDefaultController<Uint8Array>
    
    this.readable = new ReadableStream({
      start(c) {
        controller = c
      },
    })
    
    this.writable = new WritableStream({
      write(chunk: Uint8Array) {
        try {
          const compressed = compressor.compress(
            chunk,
            (brotli as any).BrotliStreamResultCode.NeedsMoreInput,
          )
          if (compressed) controller.enqueue(compressed)
        } catch (error) {
          controller.error(error)
        }
      },
      close() {
        try {
          const final = compressor.compress(
            new Uint8Array(0),
            (brotli as any).BrotliStreamResultCode.Finished,
          )
          if (final) controller.enqueue(final)
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })
  }
}

function createZlibCompressHandle(
  encoding: NodeCompressionEncoding,
  options?: NodeCompressionOptions,
): Duplex {
  switch (encoding) {
    case 'br': {
      const { windowBits, level, memLevel, params, ...rest } = options ?? {}
      const {
        BROTLI_PARAM_LGWIN,
        BROTLI_PARAM_QUALITY,
        BROTLI_PARAM_LGBLOCK,
      } = zlib!.constants

      const brotliOptions = {
        params: {
          ...(windowBits && { [BROTLI_PARAM_LGWIN]: windowBits }),
          ...(level && { [BROTLI_PARAM_QUALITY]: level }),
          ...(memLevel && { [BROTLI_PARAM_LGBLOCK]: memLevel }),
          ...params,
        },
        ...rest,
      }
      return zlib!.createBrotliCompress(brotliOptions)
    }
    case 'deflate': {
      return zlib!.createDeflate(options)
    }
    case 'gzip': {
      return zlib!.createGzip(options)
    }
    default: {
      return zlib!.createDeflateRaw(options) as never
    }
  }
}

export class ZlibCompressionStream {
  readonly readable: ReadableStream
  readonly writable: WritableStream

  constructor(
    encoding: NodeCompressionEncoding,
    options?: NodeCompressionOptions,
  ) {
    const zlibHandle = createZlibCompressHandle(encoding, options)

    this.readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of zlibHandle) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
    })

    this.writable = new WritableStream({
      write(chunk: Uint8Array) {
        zlibHandle.write(Buffer.from(chunk))
      },
      close() {
        zlibHandle.end()
      },
    })
  }
}