import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { WebSocket } from 'ws'
import { createBridge } from '../server/bridge.mjs'
import { connectBridge } from '../src/bridge.ts'
import { useOffice } from '../src/store.ts'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check) {
  const deadline = Date.now() + 4000
  while (!check()) { if (Date.now() > deadline) throw new Error('Condition timed out'); await wait(10) }
}
test('DEMO aislada y LIVE: autenticación, validación, estados, duplicados y reconexión', async t => {
  const store = useOffice
  store.getState().reset()
  store.getState().toggle()
  store.getState().step()
  assert.equal(store.getState().agents[0].status, 'thinking')
  assert.equal(store.getState().connection, 'offline')
  store.getState().toggle()
  const frozen = store.getState().tick
  store.getState().step()
  assert.equal(store.getState().tick, frozen)
  let bridge = createBridge({ token: 'test-only-token', port: 0 })
  await once(bridge.server, 'listening')
  const port = bridge.server.address().port
  t.after(async () => { await bridge.close() })
  const denied = new WebSocket(`ws://127.0.0.1:${port}/events`)
  await once(denied, 'error')
  assert.notEqual(denied.readyState, WebSocket.OPEN)
  const badOrigin = new WebSocket(`ws://127.0.0.1:${port}/watch`, { origin: 'https://untrusted.example' })
  await once(badOrigin, 'error')
  store.getState().setMode('live')
  const stop = connectBridge(`ws://127.0.0.1:${port}/watch`, store.getState().receive, store.getState().setConnection, 25)
  t.after(stop)
  await until(() => store.getState().connection === 'connected')
  const producer = new WebSocket(`ws://127.0.0.1:${port}/events`, { headers: { Authorization: 'Bearer test-only-token' } })
  t.after(() => producer.terminate())
  await once(producer, 'open')
  const send = async value => { const reply = once(producer, 'message'); producer.send(typeof value === 'string' ? value : JSON.stringify(value)); return JSON.parse((await reply)[0].toString()) }
  const make = (id, type, extra = {}) => ({ eventId: id, agentId: 'codex', type, task: 'Programando interfaz', timestamp: new Date().toISOString(), ...extra })
  const sequence = [make('1','task.started'), make('2','task.progress', { progress: 65 }), make('3','task.completed'), make('4','agent.status_changed', { status:'idle' })]
  for (const [i, e] of sequence.entries()) {
    assert.equal((await send(e)).kind, 'ack')
    await until(() => store.getState().lastEvent?.eventId === e.eventId)
    assert.equal(store.getState().agents[1].status, ['working','working','completed','idle'][i])
    if (i === 1) assert.equal(store.getState().agents[1].progress, 65)
    if (i === 2) assert.match(store.getState().notification, /CODEX/)
  }
  await promisify(execFile)(process.execPath, ['scripts/send-event.mjs'], { env: { ...process.env, AI_OFFICE_TOKEN: 'test-only-token', AI_OFFICE_EVENTS_URL: `ws://127.0.0.1:${port}/events` } })
  await until(() => store.getState().agents[1].status === 'idle' && store.getState().lastEvent?.eventId !== '4')
  const count = store.getState().logs.length
  assert.equal((await send(sequence[3])).duplicate, true)
  await wait(30)
  assert.equal(store.getState().logs.length, count)
  for (const e of ['{', make('bad1','bogus'), make('bad2','agent.status_changed', {status:'invalid'}), make('bad3','task.progress', {progress:101}), make('bad4','task.started',{agentId:'unknown'}), make('bad5','task.started',{timestamp:'invalid'})]) assert.equal((await send(e)).kind, 'rejected')
  assert.equal(store.getState().logs.length, count)
  // A new browser receives current states without announcing old completions.
  store.getState().setMode('demo')
  const demoTick = store.getState().tick
  store.getState().receive(sequence[2])
  assert.equal(store.getState().lastEvent, null)
  store.getState().toggle(); store.getState().step()
  assert.equal(store.getState().tick, demoTick + 1)
  store.getState().setMode('live')
  const stopReplay = connectBridge(`ws://127.0.0.1:${port}/watch`, store.getState().receive, () => {}, 25)
  await until(() => store.getState().lastEvent?.type === 'agent.status_changed')
  assert.equal(store.getState().notification, null)
  stopReplay()
  await bridge.close()
  await until(() => store.getState().connection === 'reconnecting')
  // Reconnect after an actual server restart; UI/store stay usable meanwhile.
  store.getState().select(1)
  assert.equal(store.getState().selected, 1)
  bridge = createBridge({ token: 'test-only-token', port })
  await once(bridge.server, 'listening')
  await until(() => store.getState().connection === 'connected')
  stop()
  assert.equal(store.getState().connection, 'offline')
})
