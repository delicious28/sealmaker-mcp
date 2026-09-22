// sealmaker MCP server —— Model Context Protocol (Streamable HTTP, stateless JSON-RPC)
// 工具：render_chinese_name_seal / lookup_meaning / suggest_names
import { renderSealPng } from './render';
import { lookupName, transliterate, NAME_TABLE } from '../../sealmaker/src/data/names';
import { MEANING, ASCII_SLUG } from '../../sealmaker/scripts/charLore.mjs';

const SITE = 'https://sealscrafter.com';
const SERVER_INFO = { name: 'sealmaker-seal-mcp', version: '1.0.0' };
const PROTOCOL_FALLBACK = '2025-03-26';
const SUPPORTED = ['2024-11-05', '2025-03-26', '2025-06-18'];

const TOOLS = [
  {
    name: 'render_chinese_name_seal',
    description:
      'Render a traditional Chinese name seal (印章) as a PNG image for a Western/English name. ' +
      'The name is transliterated into seal script (篆書) characters chosen for meaning, and the result ' +
      'includes each character meaning. Returns a base64 PNG plus an explanation. Free, no API key.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'English/Western name, e.g. "Emma" or "Alexander"' },
        size: { type: 'number', description: 'PNG edge length in px (128-1024, default 512)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'lookup_meaning',
    description:
      'Look up the meaning and etymology of a single Chinese character used in Chinese names (e.g. "雨", "李"), ' +
      'including pinyin, tone and classical sources. Links to the full page on sealscrafter.com.',
    inputSchema: {
      type: 'object',
      properties: {
        character: { type: 'string', description: 'One Chinese character, e.g. "雨"' },
      },
      required: ['character'],
    },
  },
  {
    name: 'suggest_names',
    description:
      'Suggest Chinese names for an English/Western name: the canonical transliteration with character meanings, ' +
      'plus related hand-written name pages on sealscrafter.com.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'English/Western name, e.g. "Sophie"' },
      },
      required: ['name'],
    },
  },
];

function hashN(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

async function callTool(name: string, args: any, env: Env): Promise<{ content: any[]; isError?: boolean }> {
  if (name === 'render_chinese_name_seal') {
    const raw = String(args?.name ?? '').trim();
    const en = raw.toLowerCase().replace(/[^a-z' -]/g, '').trim();
    if (!en) return { content: [{ type: 'text', text: 'Please provide a "name" argument, e.g. {"name":"Emma"}.' }], isError: true };
    const known = lookupName(en);
    const entry = known ?? transliterate(en.replace(/[^a-z]/g, ''));
    const chars = [...entry.zh];
    const size = Math.min(1024, Math.max(128, Number(args?.size) || 512));
    const png = await renderSealPng(env, chars, size);
    let text = `${raw} → ${entry.zh}`;
    if (entry.meaning) text += `\n${entry.meaning}`;
    for (const c of entry.chars ?? []) text += `\n- ${c.char}: ${c.meaning}`;
    if (entry.sealNote) text += `\nNote: ${entry.sealNote}`;
    text += known ? `\nFull page: ${SITE}/name/${known.en.replace(/\s+/g, '-')}/` : `\nMore name ideas: ${SITE}/name/ (free, with meaning, no login)`;
    const b64 = btoa(String.fromCharCode(...new Uint8Array(png)));
    return { content: [{ type: 'image', data: b64, mimeType: 'image/png' }, { type: 'text', text }] };
  }

  if (name === 'lookup_meaning') {
    const ch = String(args?.character ?? '').trim()[0] ?? '';
    const info: any = (MEANING as any)[ch];
    if (!info) {
      return { content: [{ type: 'text', text: `"${ch}" is not in the offline character table. The full library of ${Object.keys(MEANING).length} characters: ${SITE}/meaning/` }] };
    }
    const slug = (ASCII_SLUG as any)[ch] ?? encodeURIComponent(ch);
    const what = info.sur ? 'surname' : 'given-name character';
    const body = info.sur ?? info.lore ?? '';
    return { content: [{ type: 'text', text: `${ch} (${info.py}) — ${what}\n${body}\nFull entry: ${SITE}/meaning/${slug}/` }] };
  }

  if (name === 'suggest_names') {
    const en = String(args?.name ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
    if (!en) return { content: [{ type: 'text', text: 'Please provide a "name" argument.' }], isError: true };
    const known = lookupName(en);
    const entry = known ?? transliterate(en);
    let text = `${en} → ${entry.zh}`;
    if (entry.meaning) text += `\n${entry.meaning}`;
    for (const c of entry.chars ?? []) text += `\n- ${c.char}: ${c.meaning}`;
    const h = hashN(en);
    const picks = [1, 2, 3].map((k) => NAME_TABLE[(h * 7919 + k * 104729) % NAME_TABLE.length]);
    text += '\n\nRelated hand-written name pages:';
    for (const p of picks) text += `\n- ${p.en}: ${p.zh} (${p.meaning}) ${SITE}/name/${p.en.replace(/\s+/g, '-')}/`;
    return { content: [{ type: 'text', text }] };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}

async function handleRpc(body: any, env: Env): Promise<Response> {
  const id = body?.id ?? null;
  const method = body?.method ?? '';
  const reply = (result: any) =>
    Response.json({ jsonrpc: '2.0', id, result }, { headers: CORS });
  try {
    if (method === 'initialize') {
      const asked = body?.params?.protocolVersion;
      return reply({
        protocolVersion: SUPPORTED.includes(asked) ? asked : PROTOCOL_FALLBACK,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: 'Renders traditional Chinese name seals (篆書印章) as PNG images with character meanings. Free and open.',
      });
    }
    if (method === 'ping') return reply({});
    if (method === 'tools/list') return reply({ tools: TOOLS });
    if (method === 'tools/call') {
      const out = await callTool(body?.params?.name, body?.params?.arguments, env);
      return Response.json({ jsonrpc: '2.0', id, result: out }, { headers: CORS });
    }
    if (method.startsWith('notifications/')) return new Response(null, { status: 202, headers: CORS });
    if (id === null) return new Response(null, { status: 202, headers: CORS });
    return Response.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } }, { headers: CORS });
  } catch (e: any) {
    return Response.json({ jsonrpc: '2.0', id, error: { code: -32603, message: String(e?.message ?? e) } }, { headers: CORS });
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (req.method === 'GET' && url.pathname === '/render') {
      const en = (url.searchParams.get('name') ?? 'emma').toLowerCase().replace(/[^a-z' -]/g, '') || 'emma';
      const known = lookupName(en);
      const entry = known ?? transliterate(en.replace(/[^a-z]/g, ''));
      const png = await renderSealPng(env, [...entry.zh], 512);
      return new Response(png as unknown as BodyInit, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', ...CORS } });
    }

    if (req.method === 'POST' && (url.pathname === '/' || url.pathname === '/mcp')) {
      const body = await req.json().catch(() => null);
      if (Array.isArray(body)) {
        const rs = await Promise.all(body.map((b: any) => handleRpc(b, env)));
        return new Response((await Promise.all(rs.map((r) => r.text()))).map((t) => 'data: ' + t).join('\n\n') + '\n\n', {
          headers: { 'Content-Type': 'text/event-stream', ...CORS },
        });
      }
      return handleRpc(body, env);
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/mcp')) {
      return new Response(
        'sealmaker-seal-mcp — a free MCP server that carves Western names into traditional Chinese seals (篆書印章) as PNG images with meanings.\n' +
        'Connect (Streamable HTTP): POST JSON-RPC to ' + url.origin + '/ — see https://sealscrafter.com/mcp/\n',
        { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS } },
      );
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
} as ExportedHandler<Env>;
