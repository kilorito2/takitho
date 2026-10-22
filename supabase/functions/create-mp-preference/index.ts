import { handleCreateMpPreference } from '../_shared/handlers/payments.ts'
import { withHttp } from '../_shared/http.ts'
import { buildDeps } from '../_shared/runtime.ts'

const deps = buildDeps()

Deno.serve(
  withHttp({ allowedOrigins: deps.config.allowedOrigins }, (req) => handleCreateMpPreference(req, deps)),
)
