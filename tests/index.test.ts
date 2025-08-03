import { describe, expect, it } from 'bun:test'
import { type Context, Hono } from 'hono'

import type { CompressionEncoding } from '~/types'

import { compress } from '~/middleware'

const TEXT_BODY = `
もしも願いが一つ叶うなら
世界でたった一人だけの友達を
生きることは素晴らしいこと
そんなふうに私も思ってみたい`

const SMALL_BODY = 'Hello, world!'

function createRequest(encoding: CompressionEncoding, headers?: HeadersInit) {
  return new Request('http://localhost/', {
    headers: { 'Accept-Encoding': encoding, ...headers },
  })
}

function textHandler(c: Context) {
  return c.text(TEXT_BODY, 200, { 'Content-Type': 'text/plain' })
}

describe('Compression Middleware', () => {
  describe('Encoding Support', () => {
    it('should handle zstd compression', async () => {
      const app = new Hono().use(compress()).get('/', textHandler)
      const response = await app.request(createRequest('zstd'))
      expect(response.headers.get('Content-Encoding')).toBe('zstd')
    })

    it('should handle brotli compression', async () => {
      const app = new Hono().use(compress()).get('/', textHandler)
      const response = await app.request(createRequest('br'))
      expect(response.headers.get('Content-Encoding')).toBe('br')
    })

    it('should handle gzip compression', async () => {
      const app = new Hono().use(compress()).get('/', textHandler)
      const response = await app.request(createRequest('gzip'))
      expect(response.headers.get('Content-Encoding')).toBe('gzip')
    })

    it('should handle deflate compression', async () => {
      const app = new Hono().use(compress()).get('/', textHandler)
      const response = await app.request(createRequest('deflate'))
      expect(response.headers.get('Content-Encoding')).toBe('deflate')
    })
  })

  describe('Configuration and Options', () => {
    it('should respect a custom threshold and not compress below it', async () => {
      const app = new Hono()
        .use(compress({ threshold: 100 }))
        .get('/', (c) => {
          const headers = { 'Content-Type': 'text/plain', 'Content-Length': SMALL_BODY.length.toString() }
          return c.text(SMALL_BODY, 200, headers)
        })
      const response = await app.request(createRequest('gzip'))
      expect(response.headers.get('Content-Encoding')).toBe(null)
    })

    it('should respect a custom threshold and compress above it', async () => {
      const app = new Hono()
        .use(compress({ threshold: 10 }))
        .get('/', (c) => {
          const headers = { 'Content-Type': 'text/plain', 'Content-Length': SMALL_BODY.length.toString() }
          return c.text(SMALL_BODY, 200, headers)
        })
      const response = await app.request(createRequest('gzip'))
      expect(response.headers.get('Content-Encoding')).toBe('gzip')
    })

    it('should not compress when filter returns false', async () => {
      const app = new Hono().use(compress({ filter: () => false })).get('/', textHandler)
      const response = await app.request(createRequest('gzip'))
      expect(response.headers.get('Content-Encoding')).toBe(null)
    })

    it('should compress when filter returns true', async () => {
      const app = new Hono().use(compress({ filter: () => true })).get('/', textHandler)
      const response = await app.request(createRequest('gzip'))
      expect(response.headers.get('Content-Encoding')).toBe('gzip')
    })

    it('should throw an error for unsupported encodings', () => {
      const initializeWithInvalidEncoding = () => {
        new Hono().use(compress({ encoding: 'invalid-encoding' as any }))
      }
      expect(initializeWithInvalidEncoding).toThrow('Unsupported encoding: invalid-encoding.')
    })
  })

  describe('Header Handling', () => {
    it('should preserve additional response headers', async () => {
      const app = new Hono().use(compress({ encoding: 'deflate' })).get('/', (c) => {
        c.res.headers.set('X-Powered-By', 'Hono')
        return textHandler(c)
      })
      const response = await app.request(createRequest('deflate'))
      expect(response.headers.get('Content-Encoding')).toBe('deflate')
      expect(response.headers.get('X-Powered-By')).toBe('Hono')
    })

    it('should not compress if "x-no-compression" request header is present', async () => {
      const app = new Hono().use(compress()).get('/', textHandler)
      const request = createRequest('gzip', { 'x-no-compression': 'true' })
      const response = await app.request(request)
      expect(response.headers.get('Content-Encoding')).toBe(null)
    })

    it('should not compress if "Cache-Control: no-transform" is set', async () => {
      const app = new Hono().use(compress()).get('/', (c) => {
        c.header('Cache-Control', 'no-transform')
        return c.text(TEXT_BODY)
      })
      const response = await app.request(createRequest('gzip'))
      expect(response.headers.get('Content-Encoding')).toBe(null)
    })

    it('should not compress if response already has a Content-Encoding', async () => {
      const app = new Hono().use(compress()).get('/', (c) => {
        c.header('Content-Encoding', 'identity')
        return c.text(TEXT_BODY)
      })
      const response = await app.request(createRequest('gzip'))
      expect(response.headers.get('Content-Encoding')).toBe('identity')
    })
  })

  describe('Content-Type Handling', () => {
    it('should preserve "text/plain" content type', async () => {
      const app = new Hono().use(compress({ encoding: 'deflate' })).get('/', textHandler)
      const response = await app.request(createRequest('deflate'))
      expect(response.headers.get('Content-Type')).toBe('text/plain')
    })

    it('should preserve "application/json" content type', async () => {
      const app = new Hono()
        .use(compress())
        .get('/', (c) => c.json({ hello: 'world' }))
      const response = await app.request(createRequest('deflate'))
      expect(response.headers.get('Content-Type')).toStartWith('application/json')
    })

    it('should not compress non-compressible types like images', async () => {
      const app = new Hono().use(compress())
      app.get('/', async (c) =>
        c.body(await Bun.file('tests/mei.jpg').arrayBuffer(), 200, {
          'Content-Type': 'image/jpeg',
        }),
      )
      const response = await app.request(createRequest('deflate'))
      expect(response.headers.get('Content-Encoding')).toBe(null)
      expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    })
  })
})