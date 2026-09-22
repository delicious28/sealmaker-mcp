# SealsCrafter MCP Server (印章 · Chinese name seals)

[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.delicious28%2Fsealmaker--mcp-blue)](https://github.com/modelcontextprotocol/registry)
[![Smithery](https://img.shields.io/badge/Smithery-delicious28%2Fsealmaker--mcp-green)](https://smithery.ai/servers/delicious28/sealmaker-mcp)
[![Cursor Directory](https://img.shields.io/badge/Cursor%20Directory-sealmaker--mcp-black)](https://cursor.directory/plugins/sealmaker-mcp)

**[SealsCrafter](https://www.sealscrafter.com)** is a free, remote [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives AI assistants the ability to **carve a Western name into an authentic Chinese name seal (印章)** — real seal script (篆書), a real Chinese name chosen for meaning, returned as a PNG with every character explained.

📖 **Website & documentation: [https://www.sealscrafter.com/mcp/](https://www.sealscrafter.com/mcp/)**
🖼️ **Live image demo (renders on request): [sealscrafter.com/render?name=emma](https://www.sealscrafter.com/render?name=emma)**

| | | |
|---|---|---|
| ![Emma](https://www.sealscrafter.com/render?name=emma) | ![Alexander](https://www.sealscrafter.com/render?name=alexander) | ![Sophie](https://www.sealscrafter.com/render?name=sophie) |

## Why SealsCrafter

- **Real seal script, not clip-art** — glyphs are vector outlines from the Zhongshan King (中山王) bronze-inscription school, the same engine as the [free generator](https://www.sealscrafter.com), then rasterized server-side as a red-on-paper seal PNG (朱文 style)
- **Real Chinese names, not random transliteration** — 53 hand-written name pages (Emma → 艾玛, "wholeness") plus a principled fallback for any other name; every character carries an auspicious meaning
- **Meanings included in every call** — each tool result explains the characters (pinyin, etymology, classical sources), so the assistant can actually *talk about* the seal
- **Free, no API key, no signup** — zero-configuration remote server, generous rate limits for personal use
- Every result links back to the corresponding page on [sealscrafter.com](https://www.sealscrafter.com)

## Quick start

The endpoint is a stateless **Streamable HTTP** MCP server (JSON-RPC 2.0):

```
https://www.sealscrafter.com/mcp
```

### Claude Code

```bash
claude mcp add --transport http sealscrafter https://www.sealscrafter.com/mcp
```

### Claude Desktop / ChatGPT connector / Cursor / Windsurf / VS Code (mcp.json)

```json
{
  "mcpServers": {
    "sealscrafter": {
      "url": "https://www.sealscrafter.com/mcp"
    }
  }
}
```

### Just want the picture?

Any `<img>` tag can embed the renderer directly:

```html
<img src="https://www.sealscrafter.com/render?name=emma" width="220" />
```

## Tools

| Tool | Description |
|---|---|
| `render_chinese_name_seal` | English name in → base64 PNG seal out (128–1024 px, default 512) + the meaning of every character + a link to the full name page |
| `lookup_meaning` | One Chinese character in → pinyin, tone, etymology and classical sources (122-character lore library) |
| `suggest_names` | English name in → the canonical Chinese name with character meanings, plus hand-written related name pages |

Example `tools/call` → the assistant receives an `image` content block plus text like:

```
Emma → 艾玛
Wholeness/whole → 艾 (herb of moxa family) + 玛 (fine jade)
Full page: https://www.sealscrafter.com/name/emma/
```

## Running your own copy

The production server runs on Cloudflare (Pages Functions, code in [sealmaker](https://www.sealscrafter.com)). This repository contains the standalone [Cloudflare Worker](https://workers.dev) version — same rendering pipeline (opentype.js glyph outlines → SVG seal face → resvg-wasm PNG), deployable with:

```bash
npm install
npx wrangler deploy
```

Requires the fonts under `assets/fonts/` (JFZSKSeal V3.5, OFL licensed; Chong Xi Small Seal, OFL licensed). Seal script fonts are the artwork here — if you fork for a commercial product, review their OFL terms.

## Privacy

The server is stateless: it renders and answers, it does not store your names or any account.

## License

MIT (code). Fonts keep their own OFL licenses (see `assets/fonts/`).
