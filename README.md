# @bkmj/node-red-contrib-omni-http

A high-performance Node-RED suite providing **dual-mode REST routing and internal microservice dispatching**. It allows you to consolidate messy API endpoints into a single, clean router matrix (`omni-http`), dynamically trigger them in-memory while bypassing native restrictions (`omni-link-call`), and safely finalize execution cycles with a zero-leak hybrid response dispatcher (`omni-reply`).

## Features

### `omni-http` (Inbound Router & Link Target)
- **Multi-Route Matrix**: Host multiple HTTP verbs and paths (`GET /document`, `POST /document`, `DELETE /document/:_id`) inside one node.
- **Link Call Target (`Act as Link In`)**: Call your Express endpoints internally from `omni-link-call` nodes in memory (0 ms latency, no TCP/TLS overhead, no local network requests).
- **URL Parameter Extraction**: Automatically parses dynamic Express route parameters (`:_id`) and query strings even when called via `omni-link-call`.
- **Instance-Wide & Route-Specific Variables**: Inject custom architecture tokens (`msg._model`, `msg._destroy`) globally or per endpoint.

### `omni-link-call` (Universal Link Caller)
- **Bypass Native Restrictions**: Node-RED's native `link call` node is hardcoded to only target `link in` nodes. `omni-link-call` removes this limitation, allowing you to seamlessly target both standard `link in` nodes AND your `omni-http` endpoint matrices.
- **Dynamic Routing**: Dynamically route payloads to different microservices or API endpoints in memory by setting `msg.target`, `msg.url`, or `msg.topic` before reaching the node.
- **Timeout Management**: Built-in async timeout protection to prevent hanging flows if a targeted microservice fails to return a response.

### `omni-reply` (Outbound Hybrid Dispatcher)
- **Automatic Link Call Return**: Detects `msg._linkSource` and returns execution directly to the calling `omni-link-call` node in memory.
- **Native Express HTTP Responder**: Handles status codes (including `204 No Content`), headers, cookies, JSON, binary buffers, and text.
- **Anti-Crash Guard**: Protects against Node.js `[ERR_HTTP_HEADERS_SENT]` errors.
- **Memory Leak Protection**: Strips `msg.req` and `msg.res` references on finish, emitting the clean `msg` for downstream asynchronous workflows.

## Installation

```bash
npm install @bkmj/node-red-contrib-omni-http
```