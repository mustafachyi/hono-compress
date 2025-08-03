# hono-compress-experimental

A compression middleware for Hono, supporting zstd, brotli, gzip, and deflate. Designed for Bun, Node.js, Deno, and Cloud-based runtimes.

[![npm version](https://badge.fury.io/js/hono-compress-experimental.svg)](https://www.npmjs.com/package/hono-compress-experimental)

## Installation

```bash
npm install hono-compress-experimental
```

## Basic Usage

The following example enables automatic response compression for all routes.

```typescript
import { Hono } from 'hono'
import { compress } from 'hono-compress-experimental'

const app = new Hono()

app.use('*', compress())

app.get('/', (c) => c.text('Hello World!'))

export default app
```

## Encoding Selection

The middleware automatically negotiates the most effective encoding based on the client's `Accept-Encoding` header. The default evaluation priority is:

1.  `zstd`
2.  `brotli`
3.  `gzip`
4.  `deflate`

## Configuration

The `compress` middleware can be configured by passing an options object.

```typescript
import { Hono } from 'hono'
import { compress } from 'hono-compress-experimental'

const app = new Hono()

app.use('*', compress({
  // Force a specific encoding, ignoring the Accept-Encoding header.
  encoding: 'gzip',

  // Define the priority and availability of encodings.
  encodings: ['br', 'gzip'],

  // Set the minimum response body size in bytes to be eligible for compression.
  threshold: 1024,

  // An array of additional MIME types to consider for compression.
  compressibleTypes: ['application/protobuf', 'application/xml'],

  // Compression level for zstd (1-22).
  zstdLevel: 2,

  // Compression level for brotli (1-11).
  brotliLevel: 4,

  // Compression level for gzip (0-9).
  gzipLevel: 6,

  // A function to determine if a given context should be compressed.
  // Must return true to enable compression.
  filter: (c) => {
    return !c.req.path.startsWith('/api/')
  }
}))
```

## Automatic Deactivation

Compression is automatically bypassed under the following conditions:

*   The `Content-Encoding` header is already present on the response.
*   The `x-no-compression` header is present on the request.
*   The `Cache-Control` header contains the `no-transform` directive.
*   The response body size is smaller than the configured `threshold`.
*   The `Content-Type` is not typically compressible (e.g., `image/*`, `video/*`) and is not included in the `compressibleTypes` option.
*   The request method is `HEAD`.

## Runtime Compatibility

| Runtime              | `zstd` | `brotli` | `gzip` | `deflate` |
| -------------------- | ------ | -------- | ------ | --------- |
| **Bun**              | Yes    | Yes      | Yes    | Yes       |
| **Node.js**          | Yes    | Yes      | Yes    | Yes       |
| **Deno**             | \*     | Yes      | Yes    | Yes       |
| **Cloudflare Workers** | \*     | Yes      | Yes    | Yes       |

*\* Lacks native support. Middleware falls back to the next available encoding.*

## API Reference

### `compress(options?: CompressOptions)`

| Option      | Type                         | Default                             | Description                                            |
| ----------- | ---------------------------- | ----------------------------------- | ------------------------------------------------------ |
| `encoding`  | `CompressionEncoding`        | `undefined`                         | Force a specific encoding algorithm.                   |
| `encodings` | `CompressionEncoding[]`      | `['zstd', 'br', 'gzip', 'deflate']` | Allowed algorithms in order of preference.             |
| `threshold` | `number`                     | `1024`                              | Minimum response size in bytes to compress.            |
| `compressibleTypes` | `string[]`           | `[]`                                | An array of additional MIME types to consider compressible. |
| `zstdLevel` | `number`                     | `2`                                 | Zstandard compression level (1-22).                    |
| `brotliLevel` | `number`                     | `4`                                 | Brotli compression level (1-11).                       |
| `gzipLevel` | `number`                     | `6`                                 | Gzip compression level (0-9).                          |
| `filter`    | `(context: Context) => boolean` | `undefined`                         | Function to conditionally enable/disable compression.  |

### Types

```typescript
import type { Context } from 'hono'

type CompressionEncoding = 'zstd' | 'br' | 'gzip' | 'deflate'

interface CompressOptions {
  encoding?: CompressionEncoding
  encodings?: CompressionEncoding[]
  threshold?: number
  compressibleTypes?: string[]
  zstdLevel?: number
  brotliLevel?: number
  gzipLevel?: number
  filter?: (context: Context) => boolean
}
```

## Note

This package is an experimental fork of `hono-compress` with modifications (mybe ?)

## License

MIT