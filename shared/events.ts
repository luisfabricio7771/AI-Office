export const statuses = ['idle', 'thinking', 'working', 'completed', 'error'] as const
export type Status = typeof statuses[number]
export type AgentEvent = { eventId: string; agentId: 'jarvis' | 'codex' | 'nexus' | 'scout'; type: 'task.started' | 'task.progress' | 'task.completed' | 'task.failed' | 'agent.status_changed'; task?: string; timestamp: string; status?: Status; progress?: number; source?: 'codex-cli' | 'simulation' }
export function validEvent(value: unknown): value is AgentEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const e = value as Record<string, unknown>
  if (Object.keys(e).some(key => !['eventId','agentId','type','task','timestamp','status','progress','source'].includes(key))) return false
  return (e.source === undefined || e.source === 'codex-cli' || e.source === 'simulation')
    && typeof e.eventId === 'string' && /^[\w.-]{1,128}$/.test(e.eventId)
    && ['jarvis','codex','nexus','scout'].includes(e.agentId as string)
    && ['task.started','task.progress','task.completed','task.failed','agent.status_changed'].includes(e.type as string)
    && typeof e.timestamp === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(e.timestamp) && Number.isFinite(Date.parse(e.timestamp))
    && (e.task === undefined || typeof e.task === 'string' && e.task.trim().length > 0 && e.task.length <= 500)
    && (e.type === 'agent.status_changed' ? statuses.includes(e.status as Status) : e.status === undefined)
    && (e.type === 'agent.status_changed' || typeof e.task === 'string')
    && (e.progress === undefined || e.type === 'task.progress' && typeof e.progress === 'number' && Number.isFinite(e.progress) && e.progress >= 0 && e.progress <= 100)
}
export function eventStatus(e: AgentEvent): Status {
  switch (e.type) {
    case 'task.started': case 'task.progress': return 'working'
    case 'task.completed': return 'completed'
    case 'task.failed': return 'error'
    default: return e.status!
  }
}
