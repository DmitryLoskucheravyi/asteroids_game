/**
 * Запуск усієї мікросервісної системи однією командою.
 *   npm run dev            — усе з tsx watch (перезапуск при зміні коду)
 *   npm run start          — зібране з dist (після npm run build)
 *   GAME_SERVERS=4 npm run dev — скільки ігрових процесів підняти (типово 2)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { SERVICE_PORTS, type ServiceName } from '../src/services/common.js';

const prod = process.argv.includes('--prod');
const gameCount = Math.max(1, Number(process.env.GAME_SERVERS) || 2);

const COLORS = [36, 33, 35, 32, 34, 91, 96, 93, 95, 92];
const children: ChildProcess[] = [];

function run(name: string, entry: string, env: Record<string, string>, color: number): void {
  const args = prod ? [`dist/services/${entry}.js`] : ['--import', 'tsx', ...(process.argv.includes('--no-watch') ? [] : ['--watch', '--watch-preserve-output']), `src/services/${entry}.ts`];
  const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `\x1b[${color}m${name.padEnd(10)}\x1b[0m│ `;
  const pipe = (stream: NodeJS.ReadableStream, out: NodeJS.WriteStream) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const l of lines) out.write(tag + l + '\n');
    });
  };
  pipe(child.stdout!, process.stdout);
  pipe(child.stderr!, process.stderr);
  child.on('exit', (code) => process.stdout.write(`${tag}завершився (код ${code})\n`));
  children.push(child);
}

const services: ServiceName[] = ['auth', 'profile', 'shop', 'crates', 'stats', 'social', 'matchmaker', 'gateway'];
services.forEach((s, i) => run(s, s, { PORT: String(SERVICE_PORTS[s]) }, COLORS[i % COLORS.length]));
for (let i = 1; i <= gameCount; i++) run(`game:g${i}`, 'game', { GAME_ID: `g${i}`, PORT: String(8900 + i) }, COLORS[(services.length + i) % COLORS.length]);

const stop = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
