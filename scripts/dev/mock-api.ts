// Read-only stand-in for the Supabase REST API (the same seed rows the e2e mock serves), so Lighthouse can measure real
// pages without a cloud project. Usage: node scripts/dev/mock-api.ts [port]   (default 54321)
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { MockBackend } from '../../tests/e2e/support/backend.ts'

const port = Number(process.argv[2] ?? 54321)
const backend = new MockBackend()
const CRLF = String.fromCharCode(13, 10)

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`)
  const headers = {
    'access-control-allow-origin': req.headers.origin ?? '*',
    'access-control-allow-headers':
      'apikey, authorization, content-type, x-client-info, prefer, accept-profile',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    vary: 'Origin',
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers).end()
    return
  }
  const table = url.pathname.startsWith('/rest/v1/') ? url.pathname.split('/').pop() : undefined
  const rows = table ? backend.table(table, url.searchParams) : null
  if (!rows) {
    res
      .writeHead(404, { ...headers, 'content-type': 'application/json' })
      .end(JSON.stringify({ message: 'not found' }))
    return
  }
  const single = (req.headers.accept ?? '').includes('vnd.pgrst.object')
  res.writeHead(200, {
    ...headers,
    'content-type': 'application/json',
    'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
  })
  res.end(JSON.stringify(single ? rows[0] : rows))
})

// Realtime: complete the WebSocket handshake and stay silent, so pages that subscribe do not log connection errors.
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']
  if (typeof key !== 'string') {
    socket.destroy()
    return
  }
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
  const lines = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ]
  socket.write(lines.join(CRLF))
  socket.on('error', () => undefined)
})

server.listen(port, () => {
  console.log(`mock API on http://localhost:${port}`)
})
