# @bkmj/node-red-contrib-omni-http

A high-performance Node-RED suite providing **dual-mode REST routing and internal microservice dispatching**. It allows you to consolidate messy API endpoints into a single, clean router matrix (`omni-http`), and safely finalize execution cycles with a zero-leak hybrid response dispatcher (`omni-reply`).

## Features

### `omni-http` (Inbound Router & Link Target)
- **Multi-Route Matrix**: Host multiple HTTP verbs and paths (`GET /document`, `POST /document`, `DELETE /document/:_id`) inside one node.
- **Link Call Target (`Act as Link In`)**: Call your Express endpoints internally from `link call` nodes in memory (0 ms latency, no TCP/TLS overhead, no local network requests).
- **URL Parameter Extraction**: Automatically parses dynamic Express route parameters (`:_id`) and query strings even when called via `link call`.
- **Instance-Wide & Route-Specific Variables**: Inject custom architecture tokens (`msg._model`, `msg._destroy`) globally or per endpoint.

### `omni-reply` (Outbound Hybrid Dispatcher)
- **Automatic Link Call Return**: Detects `msg._linkSource` and returns execution directly to the calling `link call` node in memory.
- **Native Express HTTP Responder**: Handles status codes (including `204 No Content`), headers, cookies, JSON, binary buffers, and text.
- **Anti-Crash Guard**: Protects against Node.js `[ERR_HTTP_HEADERS_SENT]` errors.
- **Memory Leak Protection**: Strips `msg.req` and `msg.res` references on finish, emitting the clean `msg` for downstream asynchronous workflows.

```bash
npm install @bkmj/node-red-contrib-omni-http
```