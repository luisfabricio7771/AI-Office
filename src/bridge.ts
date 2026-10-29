import { validEvent, type AgentEvent } from '../shared/events.ts'
export type Connection = 'offline' | 'connecting' | 'connected' | 'reconnecting'
export function connectBridge(url: string, receive: (event: AgentEvent, replay: boolean) => void, connection: (state: Connection) => void, baseDelay = 1000) {
  let socket: WebSocket | undefined, timer: ReturnType<typeof setTimeout>, watchdog: ReturnType<typeof setTimeout>, stopped = false, attempt = 0
  const open = () => {
    if (stopped) return
    connection(attempt ? 'reconnecting' : 'connecting')
    try { socket = new WebSocket(url) } catch { retry(); return }
    watchdog = setTimeout(() => socket?.close(), 8000)
    socket.onopen = () => { clearTimeout(watchdog); attempt = 0; connection('connected') }
    socket.onmessage = message => {
      try {
        const data = JSON.parse(message.data)
        if (data.kind === 'event' && validEvent(data.event)) receive(data.event, false)
        if (data.kind === 'snapshot' && Array.isArray(data.events)) for (const event of data.events) if (validEvent(event)) receive(event, true)
      } catch { /* Ignore malformed bridge messages. */ }
    }
    socket.onerror = () => socket?.close()
    socket.onclose = retry
  }
  const retry = () => {
    clearTimeout(watchdog)
    if (stopped) return
    connection('reconnecting')
    timer = setTimeout(open, Math.min(baseDelay * 2 ** attempt++, 15000))
  }
  open()
  return () => { stopped = true; clearTimeout(timer); clearTimeout(watchdog); socket?.close(); connection('offline') }
}
