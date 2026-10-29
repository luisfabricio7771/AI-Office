import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createBridge } from '../server/bridge.mjs'
import { runAdapter } from './codex-bridge.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
export async function startOffice({ open = true } = {}) {
  const { createServer } = await import('vite')
  const token = randomBytes(32).toString('hex')
  const origins = []
  const bridge = createBridge({ token, port: 0, origins })
  let vite
  try {
    await once(bridge.server, 'listening')
    const bridgeUrl = `ws://127.0.0.1:${bridge.server.address().port}`
    vite = await createServer({ root, server: { host: '127.0.0.1', port: 5173, strictPort: false }, define: { 'import.meta.env.VITE_BRIDGE_URL': JSON.stringify(`${bridgeUrl}/watch`) } })
    await vite.listen()
    const url = `http://127.0.0.1:${vite.httpServer.address().port}`
    origins.push(url)
    if (open) {
      const command = process.platform === 'win32' ? ['cmd.exe',['/d','/c','start','',`${url}/?mode=live`]] : process.platform === 'darwin' ? ['open',[`${url}/?mode=live`]] : ['xdg-open',[`${url}/?mode=live`]]
      const browser = spawn(command[0], command[1], { stdio: 'ignore' })
      browser.on('error', () => {}); browser.unref()
    }
    return { url, bridgeUrl, token, close: async () => { await vite.close(); await bridge.close() } }
  } catch (error) { await vite?.close(); await bridge.close(); throw error }
}
// The task is sent on stdin, never interpolated into a shell command.
export function spawnCodex(args, stdio = ['pipe','pipe','inherit']) {
  const env = { ...process.env }
  delete env.AI_OFFICE_TOKEN
  return process.platform === 'win32'
    ? spawn('cmd.exe', ['/d','/s','/c', `codex.cmd ${args.join(' ')}`], { cwd: root, env, stdio })
    : spawn('codex', args, { cwd: root, env, stdio })
}
function stopChild(child) {
  if(!child || child.exitCode !== null) return
  if(process.platform === 'win32' && child.pid) {
    const stop=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'})
    stop.on('error',()=>child.kill())
  } else child.kill()
}
export async function runTask(office, task, launch = spawnCodex) {
  const child = launch(['exec','--json','-'])
  const exited = new Promise((resolve,reject) => { child.once('error',reject); child.once('close',code=>resolve(code)) })
  // Handle spawn errors even if the adapter is still waiting on its stream.
  exited.catch(() => {})
  child.stdin.on('error',()=>{})
  child.stdin.end(task)
  try {
    const result = await runAdapter({ input: child.stdout, token: office.token, url: `${office.bridgeUrl}/events` })
    const code = await exited
    if(code !== 0) throw new Error('Codex no terminó correctamente. Revisa su sesión y los mensajes de esta terminal.')
    return result
  } finally { stopChild(child) }
}
async function main() {
  const office = await startOffice({ open: !process.argv.includes('--no-open') })
  console.log(`\nAI OFFICE conectado: ${office.url}/?mode=live\nToken local automático. No necesitas copiarlo.\n`)
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  let child, closing = false
  const close = async () => { if(closing)return;closing=true;stopChild(child);rl.close();await office.close() }
  process.once('SIGINT',()=>{void close()});process.once('SIGTERM',()=>{void close()})
  try {
    while(!closing) {
      const answer = (await rl.question('[P] Probar sin créditos · [L] Iniciar sesión Codex · [C] Nueva tarea Codex · [S] Salir: ')).trim().toLowerCase()
      if(answer==='s') break
      if(answer==='p') {
        const input = createReadStream(new URL('../examples/codex-demo.jsonl',import.meta.url))
        try { await runAdapter({ input, token: office.token, url: `${office.bridgeUrl}/events`, source:'simulation' }); console.log('Prueba SIMULADA enviada. No se ejecutó Codex.\n') } finally {input.destroy()}
      } else if(answer==='l') {
        console.log('Si Codex no está instalado: npm.cmd install -g @openai/codex')
        rl.pause()
        try {child=spawnCodex(['login'],'inherit');await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject)})} catch {console.log('No se pudo iniciar Codex. Instálalo con el comando anterior.')} finally {child=undefined;rl.resume()}
      } else if(answer==='c') {
        const task = await rl.question('Tarea para Codex (ejecución real, consume uso; vacío cancela): ')
        if(!task.trim()) continue
        console.log('Trabajando en la carpeta de AI OFFICE. Sigue CODEX en la web.\n')
        try { await runTask(office,task,(...args)=>{child=spawnCodex(...args);return child});console.log('Sesión de Codex terminada.\n') } catch {console.log('No se pudo completar la tarea. Comprueba Codex instalado y usa L para iniciar sesión.')} finally {child=undefined}
      }
    }
  } catch(error) {if(!closing)throw error} finally {await close()}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(()=>{console.error('No se pudo iniciar AI OFFICE. Usa Node >=22.18 y ejecuta npm.cmd install.');process.exitCode=1})
