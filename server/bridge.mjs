import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import { validEvent } from '../shared/events.ts'

export function createBridge({ token, port = 8787, host = '127.0.0.1', origins = ['http://localhost:5173', 'http://127.0.0.1:5173'], heartbeatMs = 30000 } = {}) {
  if (!token) throw new Error('Configura AI_OFFICE_TOKEN antes de iniciar el servidor.')
  const server = http.createServer((_req, res) => { res.writeHead(404); res.end() })
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false })
  const viewers = new Set()
  const seen = new Set()
  const latest = new Map()
  const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)) }
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost')
    const viewer = url.pathname === '/watch'
    const originAllowed = !req.headers.origin || origins.includes(req.headers.origin)
    const supplied = Buffer.from(req.headers.authorization || '')
    const expected = Buffer.from(`Bearer ${token}`)
    const authorized = supplied.length === expected.length && timingSafeEqual(supplied, expected)
    if (!originAllowed || !(viewer || url.pathname === '/events' && authorized)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return
    }
    wss.handleUpgrade(req, socket, head, ws => {
      ws.alive = true
      ws.on('pong', () => { ws.alive = true })
      ws.on('error', () => {})
      if (viewer) {
        viewers.add(ws)
        send(ws, { kind: 'snapshot', events: [...latest.values()] })
        ws.on('close', () => viewers.delete(ws))
        ws.on('message', () => ws.close(1008, 'Read-only connection'))
      } else ws.on('message', (raw, binary) => {
        let e
        try { if (binary) throw new Error(); e = JSON.parse(raw.toString()) } catch { send(ws, { kind: 'rejected', reason: 'Invalid JSON' }); return }
        if (!validEvent(e)) { send(ws, { kind: 'rejected', reason: 'Invalid event fields' }); return }
        if (seen.has(e.eventId)) { send(ws, { kind: 'ack', eventId: e.eventId, duplicate: true }); return }
        seen.add(e.eventId)
        if (seen.size > 10000) seen.delete(seen.values().next().value)
        const previous = latest.get(e.agentId)
        if (previous && Date.parse(e.timestamp) < Date.parse(previous.timestamp)) { send(ws, { kind: 'rejected', reason: 'Stale timestamp' }); return }
        const resolved = { ...e, task: e.task ?? previous?.task }
        latest.set(e.agentId, resolved)
        for (const viewer of viewers) send(viewer, { kind: 'event', event: resolved })
        send(ws, { kind: 'ack', eventId: e.eventId, duplicate: false })
      })
    })
  })
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue }
      ws.alive = false; ws.ping()
    }
  }, heartbeatMs)
  server.on('close', () => clearInterval(heartbeat))
  server.listen(port, host)
  return { server, close: () => { for (const ws of wss.clients) ws.terminate(); return new Promise(resolve => server.close(resolve)) } }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bridge = createBridge({ token: process.env.AI_OFFICE_TOKEN, port: Number(process.env.AI_OFFICE_PORT || 8787), host: process.env.AI_OFFICE_HOST || '127.0.0.1', origins: (process.env.AI_OFFICE_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',') })
  bridge.server.on('listening', () => console.log(`AI OFFICE bridge · localhost:${bridge.server.address().port}`))
  bridge.server.on('error', error => { console.error(error.message); process.exitCode = 1; bridge.close() })
}
