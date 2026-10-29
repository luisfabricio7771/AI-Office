import test from 'node:test'
import assert from 'node:assert/strict'
import { once, EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { WebSocket } from 'ws'
import { startOffice, runTask } from './start-office.mjs'

test('Inicio único: token automático, cliente LIVE y tarea conectada sin shell ni tokens en el cliente', async t => {
  const office=await startOffice({open:false})
  t.after(()=>office.close())
  assert.equal(office.token.length,64)
  const main=await (await fetch(`${office.url}/src/main.tsx`)).text()
  assert.ok(!main.includes(office.token));assert.ok(main.includes(office.bridgeUrl));assert.ok(main.includes('mode'))
  const viewer=new WebSocket(`${office.bridgeUrl}/watch`,{origin:office.url})
  const events=[]
  viewer.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.kind==='event')events.push(m.event)})
  await once(viewer,'open');t.after(()=>viewer.terminate())
  const prompt='Revisa sin modificar; $(& echo PRIVATE) "test"\nSegunda línea'
  let captured=''
  const launch=args=>{
    assert.deepEqual(args,['exec','--skip-git-repo-check','--json','-'])
    const child=new EventEmitter()
    child.stdin=new PassThrough();child.stdout=new PassThrough();child.exitCode=null
    child.kill=()=>assert.fail('Completed child should not be killed')
    child.stdin.on('data',data=>captured+=data.toString())
    child.stdin.on('finish',()=>{
      child.stdout.end('{"type":"turn.started"}\n{"type":"turn.completed"}\n')
      child.exitCode=0;setImmediate(()=>child.emit('close',0))
    })
    return child
  }
  const result=await runTask(office,prompt,launch)
  assert.equal(result.sent,2);assert.equal(captured,prompt)
  assert.equal(events.length,2);assert.ok(events.every(e=>e.source==='codex-cli'))
  assert.ok(!JSON.stringify(events).includes('PRIVATE'))
  assert.equal(events[1].type,'task.completed')
  viewer.terminate()
})

test('Menú de una terminal: probar y salir sin claves manuales ni Codex', async t => {
  const { spawn }=await import('node:child_process')
  const child=spawn(process.execPath,['scripts/start-office.mjs','--no-open'],{stdio:['pipe','pipe','pipe']})
  t.after(()=>child.kill())
  let output='',sent=false,done=false
  child.stdout.on('data',data=>{
    output+=data.toString()
    if(!sent&&output.includes('[P]')){sent=true;child.stdin.write('p\n')}
    if(!done&&output.includes('Prueba SIMULADA enviada')){done=true;child.stdin.write('s\n')}
  })
  const timeout=setTimeout(()=>child.kill(),15000)
  const [code]=await once(child,'exit');clearTimeout(timeout)
  assert.equal(code,0);assert.ok(done);assert.match(output,/Token local automático/)
})
