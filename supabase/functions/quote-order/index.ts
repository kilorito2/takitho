import { handleQuoteOrder } from '../_shared/handlers/orders.ts'
import { withHttp } from '../_shared/http.ts'
import { buildDeps } from '../_shared/runtime.ts'

const deps = buildDeps()

Deno.serve(withHttp({ allowedOrigins: deps.config.allowedOrigins }, (req) => handleQuoteOrder(req, deps)))
