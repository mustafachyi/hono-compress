import type { Duplex } from 'node:stream'

import zstd from '@mongodb-js/zstd'
import { Buffer } from 'node:buffer'

import type { NodeCompressionEncoding, NodeCompressionOptions } from '~/types'

import { brotli, zlib } from '~/imports'

export class ZstdCompressionStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(level?: number) {
    super({
      async transform(chunk, controller) {
        const compressedChunk = await zstd.compress(Buffer.from(chunk), level)
        controller.enqueue(compressedChunk)
      },
    })
  }
}

export class BrotliCompressionStream {
  readonly readable: ReadableStream
  readonly writable: WritableStream

  constructor(_level?: number) {
    if (!brotli) {
      throw new Error('Brotli compression not available')
    }
    const compressor = new brotli.CompressStream()
    let controller: ReadableStreamDefaultController<Uint8Array>
    const COMPRESSION_BUFFER_SIZE = 8192
    
    this.readable = new ReadableStream({
      start(c) {
        controller = c
      },
    })
    
    this.writable = new WritableStream({
      write(chunk: Uint8Array) {
        try {
          let resultCode: number
          let inputOffset = 0
          
          do {
            const input = chunk.slice(inputOffset)
            const result = compressor.compress(input, COMPRESSION_BUFFER_SIZE)
            
            if (result.buf && result.buf.length > 0) {
              controller.enqueue(result.buf)
            }
            
            resultCode = result.code
            inputOffset += result.input_offset
            
          } while (
            resultCode === brotli!.BrotliStreamResultCode.NeedsMoreOutput ||
            (inputOffset < chunk.length && resultCode === brotli!.BrotliStreamResultCode.NeedsMoreInput)
          )
          
          if (resultCode !== brotli!.BrotliStreamResultCode.NeedsMoreInput) {
            throw new Error(`Brotli compression failed with code ${resultCode}`)
          }
        } catch (error) {
          controller.error(error)
        }
      },
      close() {
        try {
          let resultCode: number
          do {
            const result = compressor.compress(undefined, COMPRESSION_BUFFER_SIZE)
            
            if (result.buf && result.buf.length > 0) {
              controller.enqueue(result.buf)
            }
            
            resultCode = result.code
          } while (resultCode === brotli!.BrotliStreamResultCode.NeedsMoreOutput)
          
          if (resultCode !== brotli!.BrotliStreamResultCode.ResultSuccess) {
            throw new Error(`Brotli compression flush failed with code ${resultCode}`)
          }
          
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
      start(controller) {
        zlibHandle.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk))
        })
        
        zlibHandle.on('end', () => {
          controller.close()
        })
        
        zlibHandle.on('error', (error: Error) => {
          controller.error(error)
        })
      },
    })

    this.writable = new WritableStream({
      write(chunk: Uint8Array) {
        return new Promise<void>((resolve, reject) => {
          try {
            const buffer = Buffer.from(chunk)
            
            if (!Buffer.isBuffer(buffer)) {
              reject(new Error('Invalid data type for compression stream'))
              return
            }
            
            const success = zlibHandle.write(buffer)
            if (success) {
              resolve()
            } else {
              zlibHandle.once('drain', resolve)
              zlibHandle.once('error', reject)
            }
          } catch (error) {
            reject(new Error(`Compression stream error: ${error instanceof Error ? error.message : 'Unknown error'}`))
          }
        })
      },
      close() {
        return new Promise<void>((resolve, reject) => {
          try {
            zlibHandle.end()
            zlibHandle.once('finish', resolve)
            zlibHandle.once('error', reject)
          } catch (error) {
            reject(new Error(`Compression end error: ${error instanceof Error ? error.message : 'Unknown error'}`))
          }
        })
      },
    })
  }
}