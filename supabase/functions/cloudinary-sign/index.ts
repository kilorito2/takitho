import { handleCloudinarySign } from '../_shared/handlers/staff.ts'
import { withHttp } from '../_shared/http.ts'
import { buildDeps } from '../_shared/runtime.ts'

const deps = buildDeps()

Deno.serve(withHttp({ allowedOrigins: deps.config.allowedOrigins }, (req) => handleCloudinarySign(req, deps)))
