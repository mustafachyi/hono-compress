import type { CompressionEncoding } from './types'

export const COMPRESSIBLE_REGEX = /^(?:text\/|application\/(?:json|xml|javascript|dart|ecmascript|tar|toml|yaml|ld\+json)|image\/svg\+xml|application\/.*(?:\+|-)(?:json|xml))/i

export const ACCEPTED_ENCODINGS: CompressionEncoding[] = ['zstd', 'br', 'gzip', 'deflate']

const ENCODING_REGEXES = ACCEPTED_ENCODINGS.reduce((acc, enc) => {
  acc[enc] = new RegExp(`(?:^|,)\\s*${enc}\\s*(?:;\\s*q\\s*=\\s*([0-9.]+))?`, 'i')
  return acc
}, {} as Record<CompressionEncoding, RegExp>)

export const shouldCompress = (res: Response, threshold = 1024) => {
  const { body, headers } = res
  if (!body) return false
  const length = headers.get('Content-Length')
  return !length || +length >= threshold
}

export const isCompressible = (contentType: string | null | undefined) =>
  !!contentType && COMPRESSIBLE_REGEX.test(contentType)

export const getEncoding = (accept: string | null | undefined, supported: CompressionEncoding[]) => {
  if (!accept) return null
  
  let match: CompressionEncoding | null = null
  let maxQ = 0

  for (const encoding of supported) {
    const regex = ENCODING_REGEXES[encoding] || new RegExp(`(?:^|,)\\s*${encoding}\\s*(?:;\\s*q\\s*=\\s*([0-9.]+))?`, 'i')
    const m = accept.match(regex)
    if (m) {
      const q = m[1] ? parseFloat(m[1]) : 1.0
      if (q > maxQ) {
        maxQ = q
        match = encoding
      }
    }
  }
  return match
}