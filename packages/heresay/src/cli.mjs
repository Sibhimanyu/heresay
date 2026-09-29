/**
 * npx heresay connect               link this repo to its Heresay apps (MCP server + skill)
 * npx heresay mcp                   the MCP server (started by your agent, not by you)
 * npx heresay <command>             the same actions for agents without MCP
 */
import pc from 'picocolors';
import { spawn } from 'node:child_process';
import { client, connection, findApp, guide, installGuide, verifyInstall, HeresayError } from './client.mjs';

const HELP = `
  heresay  every report gets a hearing

  Set up
    npx heresay connect [--url <heresay>] [--token <hst_…>]   link this repo to its apps
    npx heresay connect --update                              refresh the skill and config files
    npx heresay disconnect [--yes]                            undo connect in this repo

  For agents (the same actions as the MCP tools)
    heresay guide [topic]                  start | install-web | install-apple | fix-brief | write-note | uninstall
    heresay apps                           apps connected to this repo
    heresay create-app <name> [--site <origin>]… [--platform web]
    heresay install <app>                  install steps with this app's tag
    heresay check <app> [--wait <seconds>] is it installed? (key in this repo's code, SDK seen running)
    heresay briefs                         accepted reports routed to this repo
    heresay brief <id>                     one brief, with its prompt and notes
    heresay claim <id>                     start working on it
    heresay note <id> "<text>"             private progress note
    heresay handoff <id> <repo> "<text>"   move it to the repo where the fix belongs
    heresay fixed <id> "<note>"            the reporter reads the note in the app

  Your Heresay itself
    npx create-heresay                     set one up    (also: update, status, open, remove)
`;

function parse(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [k, v] = a.slice(2).split('=');
    const val = v !== undefined ? v : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    out[k] = out[k] === undefined ? val : [].concat(out[k], val);
  }
  return out;
}

const print = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2));
const need = (v, what) => { if (!v) { console.error(`Missing ${what}. See: npx heresay help`); process.exit(2); } return v; };

export async function main(argv) {
  const args = parse(argv);
  const [cmd, ...rest] = args._;
  if (!cmd || cmd === 'help' || args.help) { console.log(HELP); return; }
  if (cmd === 'connect') return (await import('./connect.mjs')).connect(args);
  if (cmd === 'disconnect') return (await import('./connect.mjs')).disconnect(args);
  if (cmd === 'mcp') return (await import('./mcp.mjs')).serve();
  if (['update', 'status', 'open', 'remove', 'setup'].includes(cmd)) {
    // Managing the Heresay itself lives in create-heresay, which carries the Firebase tools.
    const child = spawn('npx', ['-y', 'create-heresay@0', cmd === 'setup' ? '' : cmd, ...argv.slice(1)].filter(Boolean), { stdio: 'inherit' });
    child.on('close', (c) => process.exit(c ?? 0));
    return;
  }

  try {
    const conn = connection();
    const api = client(conn);
    switch (cmd) {
      case 'guide': return print((await guide(conn, rest[0] ?? 'start')).text);
      case 'apps': return print(await api.apps());
      case 'create-app': return print(await api.createApp({
        name: need(rest[0], 'the app name'), platform: args.platform ?? 'web',
        sites: [].concat(args.site ?? []), framework: args.framework,
      }));
      case 'install': return print(await installGuide(conn, await findApp(api, need(rest[0], 'the app id'))));
      case 'check': return print(await verifyInstall(api, await findApp(api, need(rest[0], 'the app id')), { wait: args.wait ?? 0 }));
      case 'briefs': return print(await api.briefs());
      case 'brief': {
        const b = await api.brief(need(rest[0], 'the brief id'));
        return print([b.prompt, '', `Notes: ${b.brief.notes.length ? '' : 'none'}`,
          ...b.brief.notes.map((n) => `- ${n.at} ${n.by}: ${n.text}`)].join('\n'));
      }
      case 'claim': return print(await api.claim(need(rest[0], 'the brief id')));
      case 'note': return print(await api.note(need(rest[0], 'the brief id'), need(rest.slice(1).join(' '), 'the note')));
      case 'handoff': return print(await api.handoff(need(rest[0], 'the brief id'), need(rest[1], 'the repo'), need(rest.slice(2).join(' '), 'the note')));
      case 'fixed': return print(await api.fixed(need(rest[0], 'the brief id'), need(rest.slice(1).join(' '), 'a note for the reporter')));
      default:
        console.log(`Unknown command: ${cmd}\n${HELP}`);
        process.exit(2);
    }
  } catch (e) {
    console.error(pc.red(e instanceof HeresayError ? e.message : (e?.stack ?? String(e))));
    process.exit(1);
  }
}
