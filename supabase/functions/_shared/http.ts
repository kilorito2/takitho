import { HttpError, type ApiErrorBody } from './errors.ts'

export interface CorsConfig {
  /** Exact origins allowed to call the API from a browser. Empty = same-origin tooling only. */
  allowedOrigins: readonly string[]
}

const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type'
const MAX_BODY_BYTES = 64 * 1024

export function corsHeaders(req: Request, cors: CorsConfig): Record<string, string> {
  const origin = req.headers.get('origin')
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (origin && cors.allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Headers'] = ALLOW_HEADERS
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    headers['Access-Control-Max-Age'] = '86400'
  }
  return headers
}

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  })
}

export function errorResponse(error: HttpError, extra: Record<string, string> = {}): Response {
  const body: ApiErrorBody = {
    error: error.details === undefined ? { code: error.code, message: error.message } : { code: error.code, message: error.message, details: error.details },
  }
  const headers = { ...extra }
  if (error.code === 'RATE_LIMITED') {
    const retry = (error.details as { retry_after_s?: number } | undefined)?.retry_after_s
    if (retry) headers['Retry-After'] = String(retry)
  }
  return json(error.status, body, headers)
}

/** Reads a JSON body with a size cap; anything else is a 400. */
export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) throw new HttpError('BAD_REQUEST', 'El pedido es demasiado grande.')
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) throw new HttpError('BAD_REQUEST', 'El pedido es demasiado grande.')
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new HttpError('BAD_REQUEST', 'El cuerpo no es un JSON válido.')
  }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? ''
  return forwarded.split(',')[0]?.trim() || 'unknown'
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  return match?.[1] ?? null
}

/**
 * Wraps a handler with CORS, preflight, method check and uniform error handling.
 * Unexpected errors are logged server-side and returned as a generic INTERNAL (never leak internals).
 */
export function withHttp(
  cors: CorsConfig,
  handler: (req: Request) => Promise<Response>,
  log: (message: string, detail?: unknown) => void = console.error,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const extra = corsHeaders(req, cors)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: extra })
    if (req.method !== 'POST') return errorResponse(new HttpError('BAD_REQUEST', 'Método no permitido.'), extra)
    try {
      const res = await handler(req)
      for (const [k, v] of Object.entries(extra)) res.headers.set(k, v)
      return res
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error, extra)
      log('unhandled error', error instanceof Error ? error.message : error)
      return errorResponse(new HttpError('INTERNAL', 'Algo salió mal de nuestro lado. Probá de nuevo.'), extra)
    }
  }
}
