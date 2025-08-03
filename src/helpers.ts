import { COMPRESSIBLE_CONTENT_TYPE_REGEX } from 'hono/utils/compress'

import {
  CACHECONTROL_NOTRANSFORM_REGEXP,
  CLOUDFLARE_WORKERS_NAVIGATOR,
} from './constants'

export const isCloudflareWorkers =
  globalThis.navigator?.userAgent === CLOUDFLARE_WORKERS_NAVIGATOR

export const isDenoDeploy =
  (globalThis as any).Deno?.env?.get('DENO_DEPLOYMENT_ID') !== undefined

export function isCompressible(
  response: Response,
  forceCompression: boolean,
  customTypes: string[] = [],
) {
  const contentType = response.headers.get('Content-Type')
  if (!contentType) {
    return forceCompression
  }
  
  if (customTypes.includes(contentType)) {
    return true
  }
  
  return COMPRESSIBLE_CONTENT_TYPE_REGEX.test(contentType)
}

export function isTransformable(response: Response) {
  const cacheControl = response.headers.get('Cache-Control')
  return !cacheControl || !CACHECONTROL_NOTRANSFORM_REGEXP.test(cacheControl)
}