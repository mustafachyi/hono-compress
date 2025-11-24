import { describe, expect, spyOn, test } from 'bun:test'
import { Hono } from 'hono'
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib'
import { ACCEPTED_ENCODINGS, compress } from '../src/index'
import type { CompressionEncoding } from '../src/types'

const BASE_URL = 'http://localhost:8787'

function createRequest(encoding: string | null, url = '/', method = 'GET') {
  const headers: Record<string, string> = {}
  if (encoding !== null) headers['Accept-Encoding'] = encoding
  return new Request(new URL(url, BASE_URL).toString(), { method, headers })
}

async function decode(res: Response, encoding: string | null) {
  const buffer = await res.arrayBuffer()
  const uint8 = new Uint8Array(buffer)
  if (uint8.length === 0) return ''

  try {
    if (encoding === 'zstd') return new TextDecoder().decode(Bun.zstdDecompressSync(uint8))
    if (encoding === 'br') return new TextDecoder().decode(brotliDecompressSync(uint8))
    if (encoding === 'gzip') return new TextDecoder().decode(gunzipSync(uint8))
    if (encoding === 'deflate') return new TextDecoder().decode(inflateSync(uint8))
  } catch {
    return ''
  }
  return new TextDecoder().decode(uint8)
}

describe('Compression Middleware Standards Compliance', () => {
  describe('Encoding Support & Q-Value Negotiation', () => {
    ACCEPTED_ENCODINGS.forEach((enc) => {
      test(`${enc} - compresses when requested explicitly`, async () => {
        const app = new Hono()
          .use(compress({ threshold: 0 }))
          .get('/', (c) => c.text('Success', 200, { 'Content-Type': 'text/plain' }))

        const res = await app.request(createRequest(enc))
        expect(res.headers.get('Content-Encoding')).toBe(enc)
        expect(await decode(res, enc)).toBe('Success')
      })
    })

    test('respects client q-values over server preference', async () => {
      const app = new Hono()
        .use(compress({ threshold: 0, encodings: ['br', 'gzip'] }))
        .get('/', (c) => c.text('Q-Value', 200, { 'Content-Type': 'text/plain' }))

      const res = await app.request(createRequest('br;q=0.5, gzip;q=1.0'))
      expect(res.headers.get('Content-Encoding')).toBe('gzip')
      expect(await decode(res, 'gzip')).toBe('Q-Value')
    })

    test('defaults to server preference when q-values are equal', async () => {
      const app = new Hono()
        .use(compress({ threshold: 0, encodings: ['br', 'gzip'] }))
        .get('/', (c) => c.text('Equal Q', 200, { 'Content-Type': 'text/plain' }))

      const res = await app.request(createRequest('gzip;q=1.0, br;q=1.0'))
      expect(res.headers.get('Content-Encoding')).toBe('br')
    })

    test('ignores encoding with q=0', async () => {
      const app = new Hono()
        .use(compress({ threshold: 0 }))
        .get('/', (c) => c.text('Zero Q', 200, { 'Content-Type': 'text/plain' }))

      const res = await app.request(createRequest('gzip;q=0'))
      expect(res.headers.get('Content-Encoding')).toBeNull()
      expect(await res.text()).toBe('Zero Q')
    })

    test('does not match partial tokens', async () => {
      const app = new Hono()
        .use(compress({ threshold: 0 }))
        .get('/', (c) => c.text('Partial', 200, { 'Content-Type': 'text/plain' }))

      const res = await app.request(createRequest('agzip'))
      expect(res.headers.get('Content-Encoding')).toBeNull()
    })
  })

  describe('RFC 9110 & 9111 Header Compliance', () => {
    test('weakens strong ETags', async () => {
      const app = new Hono()
        .use(compress({ threshold: 0 }))
        .get('/', (c) => {
          c.header('ETag', '"strong-tag"')
          return c.text('Content', 200, { 'Content-Type': 'text/plain' })
        })

      const res = await app.request(createRequest('gzip'))
      expect(res.headers.get('ETag')).toBe('W/"strong-tag"')
    })

    test('preserves existing weak ETags', async () => {
      const app = new Hono()
        .use(compress({ threshold: 0 }))
        .get('/', (c) => {
          c.header('ETag', 'W/"weak-tag"')
          return c.text('Content', 200, { 'Content-Type': 'text/plain' })
        })

      const res = await app.request(createRequest('gzip'))
      expect(res.headers.get('ETag')).toBe('W/"weak-tag"')
    })

    test('appends to Vary header instead of overwriting', async () => {
      const app = new Hono()
        .use(compress({ threshold: 0 }))
        .get('/', (c) => {
          c.header('Vary', 'Origin')
          return c.text('Vary Check', 200, { 'Content-Type': 'text/plain' })
        })

      const res = await app.request(createRequest('gzip'))
      const vary = res.headers.get('Vary')
      expect(vary).toContain('Origin')
      expect(vary).toContain('Accept-Encoding')
    })

    test('adds Vary header if missing', async () => {
      const app = new Hono()
        .use(compress({ threshold: 0 }))
        .get('/', (c) => c.text('New Vary', 200, { 'Content-Type': 'text/plain' }))

      const res = await app.request(createRequest('gzip'))
      expect(res.headers.get('Vary')).toBe('Accept-Encoding')
    })
  })

  describe('Control Logic & Edge Cases', () => {
    test('skips compression for HEAD requests', async () => {
      const app = new Hono()
        .use(compress({ threshold: 0 }))
        .get('/', (c) => c.text('Head', 200, { 'Content-Type': 'text/plain' }))

      const res = await app.request(createRequest('gzip', '/', 'HEAD'))
      expect(res.headers.get('Content-Encoding')).toBeNull()
      expect(res.body).toBeNull()
    })

    test('skips compression for empty body', async () => {
      const app = new Hono()
        .use(compress({ threshold: 0 }))
        .get('/', (c) => {
          c.status(204)
          return c.body(null)
        })

      const res = await app.request(createRequest('gzip'))
      expect(res.headers.get('Content-Encoding')).toBeNull()
    })

    test('respects strict mode x-no-compression', async () => {
      const app = new Hono()
        .use(compress({ strict: true, threshold: 0 }))
        .get('/', (c) => c.text('No Comp', 200, { 'Content-Type': 'text/plain' }))

      const req = createRequest('gzip')
      req.headers.set('x-no-compression', 'true')
      const res = await app.request(req)
      expect(res.headers.get('Content-Encoding')).toBeNull()
    })

    test('skips if Cache-Control: no-transform', async () => {
      const app = new Hono()
        .use(compress({ threshold: 0 }))
        .get('/', (c) => {
          c.header('Cache-Control', 'no-transform')
          return c.text('No Transform', 200, { 'Content-Type': 'text/plain' })
        })

      const res = await app.request(createRequest('gzip'))
      expect(res.headers.get('Content-Encoding')).toBeNull()
    })

    test('uses fallback when no encoding matches', async () => {
      const app = new Hono()
        .use(compress({ fallback: 'deflate', threshold: 0 }))
        .get('/', (c) => c.text('Fallback', 200, { 'Content-Type': 'text/plain' }))

      const res = await app.request(createRequest(null))
      expect(res.headers.get('Content-Encoding')).toBe('deflate')
    })

    test('handles streaming=false with correct Content-Length', async () => {
      const app = new Hono()
        .use(compress({ streaming: false, threshold: 0 }))
        .get('/', (c) => c.text('Buffered', 200, { 'Content-Type': 'text/plain' }))

      const res = await app.request(createRequest('gzip'))
      expect(res.headers.get('Content-Encoding')).toBe('gzip')
      expect(res.headers.has('Content-Length')).toBeTrue()
      
      const body = await res.arrayBuffer()
      expect(Number(res.headers.get('Content-Length'))).toBe(body.byteLength)
    })

    test('throws 500 on unsupported encoding configuration', async () => {
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
      
      const app = new Hono()
        .use(compress({ encoding: 'unknown' as any, threshold: 0 }))
        .get('/', (c) => c.text('Crash', 200, { 'Content-Type': 'text/plain' }))

      const res = await app.request(createRequest(null))
      expect(res.status).toBe(500)
      
      errorSpy.mockRestore()
    })
  })
})