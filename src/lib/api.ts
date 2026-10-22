import type { ApiErrorCode } from '@/types/api'

/** Error returned by an Edge Function (docs/API.md §1) or a failed network call. */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details: unknown

  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }

  /** Seconds to wait before retrying, when the server said so (429). */
  get retryAfterSeconds(): number | null {
    const d = this.details as { retry_after_s?: unknown } | undefined
    return typeof d?.retry_after_s === 'number' ? d.retry_after_s : null
  }
}

export interface CallOptions {
  /** Staff calls: the user's access token. */
  accessToken?: string
  signal?: AbortSignal
}

export interface ApiClientConfig {
  functionsUrl: string
  publishableKey: string
  fetch?: typeof fetch
}

async function readError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as {
    error?: { code?: ApiErrorCode; message?: string; details?: unknown }
  } | null
  const err = body?.error
  return new ApiError(
    err?.code ?? (res.status >= 500 ? 'INTERNAL' : 'BAD_REQUEST'),
    err?.message ?? 'Algo salió mal. Probá de nuevo.',
    res.status,
    err?.details,
  )
}

/** Thin typed client: one POST per function, uniform ApiError on failure. */
export function createApiClient({ functionsUrl, publishableKey, fetch: fetchImpl = fetch }: ApiClientConfig) {
  return {
    async call<T>(name: string, body: unknown, { accessToken, signal }: CallOptions = {}): Promise<T> {
      let res: Response
      try {
        res = await fetchImpl(`${functionsUrl}/${name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: publishableKey,
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(body),
          ...(signal ? { signal } : {}),
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        throw new ApiError('NETWORK', 'Se cortó la señal. Probá de nuevo en un toque.', 0)
      }
      if (!res.ok) throw await readError(res)
      return (await res.json()) as T
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
