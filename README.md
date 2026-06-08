# @bkmj/node-red-contrib-omni-http

A professional Node-RED custom node that creates multiple HTTP endpoints triggering a single flow. It effectively transforms your API layout from a cluttered "spaghetti" view of separate `http in` nodes into a single, highly maintainable router matrix.

## Features
- **Consolidated Routing**: Manage multiple methods and paths (e.g., `GET /document`, `POST /document`, `DELETE /document/:_id`) inside a single node.
- **Visual Integration**: Displays your system's `httpNodeRoot` prefix dynamically in the editor layout.
- **Context & Property Injection**: Inject custom properties (`msg.any_key = value`) per endpoint on arrival, acting like a built-in *Inject* node for downstream routing.
- **Smart Auto-Casting**: Automatically converts string values like `"true"`, `"false"`, or numbers into their native types, and evaluates valid JSON objects.

## Install
Run the following command in your Node-RED user directory (typically `~/.node-red`):

```bash
npm install @bkmj/node-red-contrib-omni-http
```

## Usage
1. Drag the omni http in node into your workspace.
2. Add your endpoints by choosing an HTTP method and typing the URL.
3. (Optional) Add a custom property to inject on receipt (e.g., set msg.target_model to "Document").
4. Connect an http response node downstream to complete the requests.