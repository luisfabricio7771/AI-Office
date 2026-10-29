import test from 'node:test'
import assert from 'node:assert/strict'
import { initialLife, advanceLife, meetingStart, meetingEnd, interrupt, routeBetween, nodes, desks } from '../src/living.ts'
import { useOffice } from '../src/store.ts'
const idle = Array.from({length:4},()=>({status:'idle'}))
const run = (life,seconds,agents=idle,demo=true,running=true) => {for(let t=0;t<seconds;t+=.05)life=advanceLife(life,agents,demo,running,.05);return life}
test('Las rutas de los cuatro agentes evitan escritorios, mesa, plantas y cafetera',()=>{
 const obstacles=desks.map(([x,,z])=>[x-1.1,x+1.1,z-.525,z+.525])
 obstacles.push([3.3,3.8,1.225,1.775],[3.06,4.04,-1.45,.05],[3.36,3.84,2.71,3.19],[-3.89,-3.41,-3.29,-2.81],[3.31,3.79,-3.34,-2.86])
 for(let i=0;i<4;i++)for(const target of ['rest','m0','m1','m2','m3',...desks.map((_,j)=>`exit${j}`)]){
  const path=[`home${i}`,...routeBetween(`home${i}`,target)]
  assert.equal(path.at(-1),target)
  for(let p=1;p<path.length;p++)for(let s=0;s<=50;s++){
   const a=nodes[path[p-1]], b=nodes[path[p]],x=a[0]+(b[0]-a[0])*s/50,z=a[1]+(b[1]-a[1])*s/50
   assert.ok(x>=-4.15&&x<=4.2&&z>=-3.6&&z<=3.7)
   for(const [left,right,back,front]of obstacles)assert.ok(!(x>left-.22&&x<right+.22&&z>back-.22&&z<front+.22),`${path[p-1]} -> ${path[p]} at ${x},${z}`)
  }
 }
})
test('Reunión: levantarse, caminar, sentarse, conversar y volver sin cambiar tareas',()=>{
 let life=meetingStart(initialLife(false),[0,1,2,3],idle)
 assert.equal(life.meeting.length,4)
 life=run(life,30,idle,false,false)
 assert.ok(life.motions.every(m=>m.pose==='talking'&&m.lift<.01))
 assert.equal(new Set(life.motions.map(m=>m.position.join(','))).size,4)
 assert.ok(life.meeting.includes(life.speaker))
 life=run(meetingEnd(life),30,idle,false,false)
 assert.ok(life.motions.every((m,i)=>m.target===`home${i}`&&m.pose==='seated'&&m.route.length===0&&m.lift<.01))
})
test('Una tarea LIVE interrumpe una reunión en tránsito y el regreso respeta el segmento actual',()=>{
 const s=useOffice.getState();s.setMode('demo');s.reset();s.startMeeting([0,1])
 for(let i=0;i<35;i++)useOffice.getState().advance(.05)
 const before=useOffice.getState().life.motions[1]
 assert.ok(before.route.length)
 useOffice.getState().setMode('live');useOffice.getState().startMeeting([0,1])
 for(let i=0;i<35;i++)useOffice.getState().advance(.05)
 const position=[...useOffice.getState().life.motions[1].position]
 useOffice.getState().receive({eventId:'priority-1',agentId:'codex',type:'task.started',task:'Ejecutando comando',source:'codex-cli',timestamp:new Date().toISOString()})
 let state=useOffice.getState()
 assert.equal(state.agents[1].status,'working');assert.equal(state.life.meeting.length,0)
 assert.deepEqual(state.life.motions[1].position,position)
 assert.equal(state.life.motions[1].target,'home1');assert.ok(state.life.motions[1].taskPulse>0)
 for(let i=0;i<600;i++)useOffice.getState().advance(.05)
 state=useOffice.getState();assert.equal(state.life.motions[1].pose,'seated');assert.deepEqual(state.life.motions[1].position,nodes.home1)
 state.startMeeting([0,1]);assert.equal(useOffice.getState().life.meeting.length,0)
 assert.equal(state.agents[1].source,'codex-cli')
})
test('Vida ambiental limitada a DEMO, pausas, velocidad y cancelación sin teletransporte',()=>{
 let life=run(initialLife(),13)
 assert.ok(life.motions[0].route.length>0)
 const position=[...life.motions[0].position]
 const paused=run(life,2,idle,true,false)
 assert.deepEqual(paused.motions[0].position,position)
 const slow=run({...life,speed:.5},.5),fast=run({...life,speed:2},.5)
 assert.notDeepEqual(slow.motions[0].position,fast.motions[0].position)
 assert.ok(run(initialLife(),90,idle,false,true).motions.every(m=>m.route.length===0))
 const working=idle.map(()=>({status:'working'}))
 assert.ok(run(initialLife(),90,working).motions.every((m,i)=>m.target===`home${i}`))
 const interrupted=interrupt(life,0)
 assert.deepEqual(interrupted.motions[0].position,position)
 const home=run(interrupted,20,idle,false,true)
 assert.deepEqual(home.motions[0].position,nodes.home0)
 useOffice.getState().setMode('demo');useOffice.getState().reset();useOffice.getState().toggle()
 for(let i=0;i<260;i++)useOffice.getState().advance(.05)
 useOffice.getState().setAmbient(false)
 assert.ok(useOffice.getState().life.motions.every((m,i)=>m.target===`home${i}`))
 useOffice.getState().setSpeed(100);assert.equal(useOffice.getState().life.speed,2)
})
