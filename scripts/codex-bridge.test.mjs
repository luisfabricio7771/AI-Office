import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { transformCodexEvent } from './codex-bridge.mjs'
import { createBridge } from '../server/bridge.mjs'
import { connectBridge } from '../src/bridge.ts'
import { useOffice } from '../src/store.ts'
import { validEvent } from '../shared/events.ts'
const until = async check => { const end = Date.now()+5000; while (!check()) { if(Date.now()>end) throw new Error('Timeout'); await new Promise(r=>setTimeout(r,10)) } }
test('Mapeo seguro, campos privados descartados y entradas inválidas', () => {
  const cases = [
    [{type:'turn.started'}, 'task.started', 'CODEX comienza a trabajar'],
    [{type:'item.started',item:{id:'1',type:'command_execution',command:'PRIVATE',aggregated_output:'PRIVATE'}}, 'task.progress', 'Ejecutando comando'],
    [{type:'item.updated',item:{id:'2',type:'file_change',changes:[{path:'PRIVATE',diff:'PRIVATE'}]}}, 'task.progress', 'Modificando código'],
    [{type:'item.completed',item:{id:'1',type:'command_execution'}}, 'task.progress', 'Comando finalizado'],
    [{type:'turn.completed',usage:{}}, 'task.completed', 'Tarea finalizada'],
    [{type:'turn.failed',error:{message:'PRIVATE'}}, 'task.failed', 'Error en la tarea de CODEX'],
    [{type:'error',message:'PRIVATE'}, 'task.failed', 'Error en la tarea de CODEX'],
  ]
  for (const [input,type,task] of cases) {
    const e = transformCodexEvent(input)
    assert.ok(validEvent(e)); assert.equal(e.type,type); assert.equal(e.task,task)
    assert.ok(!JSON.stringify(e).includes('PRIVATE')); assert.equal(e.progress,undefined)
  }
  for(const raw of [null,[],{}, {type:'thread.started'}, {type:'item.updated',item:{}}, {type:'item.started',item:{id:'1',type:'unknown'}}]) assert.equal(transformCodexEvent(raw),null)
})
test('CLI adaptador: archivo simulado y stdin real en streaming hasta el store', async t => {
  const bridge = createBridge({token:'test-adapter-token',port:0})
  await once(bridge.server,'listening'); t.after(()=>bridge.close())
  const port = bridge.server.address().port
  useOffice.getState().setMode('live')
  const received = []
  const stop = connectBridge(`ws://127.0.0.1:${port}/watch`, (e,replay)=>{received.push(e);useOffice.getState().receive(e,replay)}, useOffice.getState().setConnection,25)
  t.after(stop)
  await until(()=>useOffice.getState().connection==='connected')
  const env = {...process.env,AI_OFFICE_TOKEN:'test-adapter-token',AI_OFFICE_EVENTS_URL:`ws://127.0.0.1:${port}/events`}
  const sample = await promisify(execFile)(process.execPath,['scripts/codex-bridge.mjs','--file','examples/codex-demo.jsonl'],{env})
  assert.match(sample.stdout,/SIMULACIÓN: 7 eventos enviados/)
  await until(()=>received.length===7)
  assert.ok(received.every(e=>e.source==='simulation'))
  assert.equal(useOffice.getState().agents[1].completedTasks,1)
  assert.equal(useOffice.getState().agents[1].status,'completed')
  assert.match(useOffice.getState().notification,/SIMULACIÓN/)
  const child = spawn(process.execPath,['scripts/codex-bridge.mjs'],{env,stdio:['pipe','pipe','pipe']})
  t.after(()=>child.kill())
  const exited = once(child,'exit')
  let stdout='',stderr=''
  child.stdout.on('data',b=>stdout+=b); child.stderr.on('data',b=>stderr+=b)
  child.stdin.write('malformed PRIVATE\n'+JSON.stringify({type:'turn.started',prompt:'PRIVATE'})+'\n')
  await until(()=>received.length===8)
  assert.equal(useOffice.getState().agents[1].status,'working')
  assert.equal(useOffice.getState().agents[1].source,'codex-cli')
  child.stdin.write(JSON.stringify({type:'item.started',item:{id:'cmd',type:'command_execution',command:'PRIVATE'}})+'\n')
  await until(()=>useOffice.getState().agents[1].task==='Ejecutando comando')
  child.stdin.write(JSON.stringify({type:'item.updated',item:{id:'file',type:'file_change',changes:['PRIVATE']}})+'\n')
  await until(()=>useOffice.getState().agents[1].task==='Modificando código')
  child.stdin.end(JSON.stringify({type:'turn.completed'})+'\n')
  assert.equal((await exited)[0],0)
  await until(()=>useOffice.getState().agents[1].status==='completed')
  assert.equal(useOffice.getState().agents[1].task,'Tarea finalizada')
  assert.ok(useOffice.getState().agents[1].celebration>0)
  assert.ok(!JSON.stringify(received).includes('PRIVATE'))
  assert.ok(!(stdout+stderr).includes('PRIVATE'))
  const last=received.at(-1)
  useOffice.getState().receive(last)
  assert.equal(useOffice.getState().agents[1].completedTasks,1)
  useOffice.getState().setMode('demo')
  useOffice.getState().toggle();useOffice.getState().step()
  assert.equal(useOffice.getState().tick,1)
})
