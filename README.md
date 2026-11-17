# YourAppSpace MCP Server

**Give AI coding agents (Claude Code, Cursor, OpenAI Codex CLI, JetBrains AI Assistant) a structured backend with a built-in Visual Schema Designer, Data Grid UI, auto-generated REST APIs, and Row/Field-Level Security (RLS & FLS).**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-core.yourappspace.com-ff3b30)](https://core.yourappspace.com)
[![Documentation](https://img.shields.io/badge/Docs-yourappspace.com%2Fdocs-blue)](https://yourappspace.com/docs.html)
[![Video Tutorial](https://img.shields.io/badge/YouTube-Tutorial-red)](https://youtu.be/1x-sCBesZVo)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

---

## Why YourAppSpace MCP?

Most database MCP servers give an LLM raw SQL access to a database—risking destructive schema changes, leaking restricted columns, and leaving you with no UI to inspect or manage the data.

**YourAppSpace Core** solves this by pairing an **AI-ready Entity MCP** with a **Visual Data Platform**:

- **Visual Schema + Data Grid UI:** Everything your AI agent creates via MCP (`create_table`, `add_field`, `create_rows`) immediately appears in a live visual schema designer and spreadsheet-like Data Grid UI with filtering and Excel/CSV export.
- **Safe by Design (RLS & FLS):** Agents operate through the platform's Entity API governed by **Row-Level Security** and **Field-Level Security** instead of raw SQL—no accidental `DROP TABLE` or unauthorized field reads.
- **Instant REST APIs:** Every table modeled by your agent automatically exposes documented REST endpoints.
- **Zero Vendor Lock-in:** Run on YourAppSpace Cloud (`https://core.yourappspace.com`) or deploy on-premise via Docker.

> **Hosted Remote MCP (Zero-Install) — Coming Soon:**
> In the next release of YourAppSpace Core, you will be able to connect directly to a **Hosted Remote MCP endpoint (Streamable HTTP)** straight from your workspace URL—requiring **zero local installation, no Node.js, and no local processes**.
> Until then (and for local Docker / air-gapped on-premise deployments), use this lightweight open-source **STDIO connector**.

---

## Prerequisites

- **Node.js** `>= 20.0.0`
- A **YourAppSpace Core** workspace — click **Try now** on [core.yourappspace.com](https://core.yourappspace.com) for an instant demo workspace, or sign up for free.

---

## Quick Start (Local STDIO Connector)

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/yourappspace/yourappspace-mcp.git
   cd yourappspace-mcp
   npm install
   ```

2. **Connect your AI client** using one of the configurations below.

---

## Client Configuration

Replace `<path_to_repo>` with the absolute path to `yourappspace-mcp`, and set your workspace URL and credentials.

### 1. Claude Code (`.mcp.json`)

Create or update `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "dev-entity": {
      "command": "node",
      "args": ["<path_to_repo>/server.js"],
      "env": {
        "MCP_ENTITY_BASE_URL": "https://core.yourappspace.com",
        "MCP_ENTITY_USER": "your_email@example.com",
        "MCP_ENTITY_PASSWORD": "your_password"
      }
    }
  }
}
```

Verify active tools inside Claude Code by running `/mcp`.

### 2. Cursor (`.cursor/mcp.json`)

Add to `.cursor/mcp.json` in your project or global `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "dev-entity": {
      "command": "node",
      "args": ["<path_to_repo>/server.js"],
      "env": {
        "MCP_ENTITY_BASE_URL": "https://core.yourappspace.com",
        "MCP_ENTITY_USER": "your_email@example.com",
        "MCP_ENTITY_PASSWORD": "your_password"
      }
    }
  }
}
```

### 3. OpenAI Codex CLI (`~/.codex/config.toml`)

```toml
[mcp_servers.dev-entity]
command = "node"
args = ["<path_to_repo>/server.js"]

[mcp_servers.dev-entity.env]
MCP_ENTITY_BASE_URL = "https://core.yourappspace.com"
MCP_ENTITY_USER = "your_email@example.com"
MCP_ENTITY_PASSWORD = "your_password"
```

### 4. JetBrains IntelliJ IDEA AI Assistant

1. Open **Settings → Tools → AI Assistant → Model Context Protocol (MCP)**.
2. Click **+ Add** and select **STDIO**.
3. Paste the JSON configuration above (same format as Claude Code / Cursor) and click **Apply**.

---

## Available MCP Tools (8 Tools)

| Tool | Purpose | Modifies Data |
| --- | --- | --- |
| `list_tables` | Lists accessible tables across user and system spaces | No |
| `get_table` | Retrieves table metadata, column types, and schema definition | No |
| `create_table` | Creates a new custom table in the active workspace | Yes |
| `add_field` | Adds a data column (`INTEGER`, `STRING`, `DATETIME`, etc.) or lookup relationship | Yes |
| `read_rows` | Queries records with `WHERE` / JSON filters, ordering, and pagination | No |
| `create_rows` | Inserts one or multiple records in batch mode | Yes |
| `update_rows` | Updates one or multiple records by primary key | Yes |
| `delete_rows` | Deletes one or multiple records by primary key | Yes |

---

## System Prompt for AI Agents (`BASE_PROMPT.md`)

This repository includes [`BASE_PROMPT.md`](./BASE_PROMPT.md), which gives AI agents full knowledge of YourAppSpace core data types, field widgets, and lookup relationships:

- **Claude Code:** Copy [`BASE_PROMPT.md`](./BASE_PROMPT.md) to `CLAUDE.md` in your project root.
- **Codex CLI:** Copy [`BASE_PROMPT.md`](./BASE_PROMPT.md) to `AGENTS.md` in your project root.
- **IntelliJ AI Assistant:** Add it to **Settings → Tools → AI Assistant → Prompt Library**.

---

## Environment Variables

| Variable | Description | Example |
| --- | --- | --- |
| `MCP_ENTITY_BASE_URL` | Base URL of your YourAppSpace instance (SaaS or Docker) | `https://core.yourappspace.com` or `http://localhost:8080` |
| `MCP_ENTITY_USER` | Email / username of the authorized workspace user | `demo_manager@yourappspace.com` |
| `MCP_ENTITY_PASSWORD` | Password for authentication | `••••••••` |

---

## Resources

- **Live Sandbox (No Sign-Up Required):** [core.yourappspace.com](https://core.yourappspace.com)
- **Video Walkthrough:** [YouTube — YourAppSpace MCP Server Tutorial](https://youtu.be/1x-sCBesZVo)
- **Full Documentation:** [yourappspace.com/docs.html](https://yourappspace.com/docs.html)

---

## License

[MIT](./LICENSE)
