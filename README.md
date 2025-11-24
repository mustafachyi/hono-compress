# @mustafachyi/hono-compress

This is a compression middleware for [Hono](https://hono.dev).

I built this specifically for the **Bun** runtime. It combines Bun's ultra-fast native Zstandard with standard Brotli, Gzip, and Deflate compression. It's lightweight, completely dependency-free, and handles all the boring HTTP stuff (like headers, varying, and content negotiation) for you.

## Install

```bash
bun add @mustafachyi/hono-compress
```

## How to use

Import it and add it to your Hono app. That's it.

```ts
import { Hono } from 'hono'
import { compress } from '@mustafachyi/hono-compress'

const app = new Hono()

// Enable compression
app.use(compress())

app.get('/', (c) => c.text('This text will be compressed!'))

export default app
```

## Configuration

If you need full control, here is everything you can configure.

```ts
app.use(compress({
  // Only compress if the response is larger than this (bytes)
  threshold: 1024,

  // Choose which encodings you want to support
  encodings: ['br', 'gzip', 'zstd'],

  // Default encoding if the client doesn't send Accept-Encoding
  fallback: 'gzip',

  // If true, it respects the 'x-no-compression' request header
  strict: true,

  // If true, it compresses even if Content-Type looks like a binary
  // or if Cache-Control includes 'no-transform'
  force: false,

  // Stream the response (faster) or buffer it (generates Content-Length)
  streaming: true,

  // Custom logic to skip compression for specific requests
  filter: (c) => !c.req.path.includes('/static'),

  // Tweak compression levels (0-11 for Brotli, 0-9 for Gzip/Deflate)
  zstdLevel: 3,
  brotliLevel: 4,
  gzipLevel: 6,
  deflateLevel: 6,

  // Pass raw options directly to the underlying engine
  zstdOptions: { ... },
  brotliOptions: { ... },
  gzipOptions: { ... }
}))
```

## License

GNU General Public License v3.0