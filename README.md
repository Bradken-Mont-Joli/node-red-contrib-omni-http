# @bkmj/node-red-contrib-omni-http

A professional Node-RED custom node that creates multiple HTTP endpoints triggering a single flow. It effectively transforms your API layout from a cluttered "spaghetti" view of separate `http in` nodes into a single, highly maintainable router matrix.

## Features
- **Consolidated Routing**: Manage multiple methods and paths (e.g., `GET /document`, `POST /document`, `DELETE /document/:_id`) inside a single node.
- **Visual Integration**: Displays your system's `httpNodeRoot` prefix dynamically in the editor layout.
- **Instance-Wide Global Properties**: Inject properties (`msg._model = "Document"`) globally to **all** endpoints in the node. Perfect for decoupling downstream subflows!
- **Route-Specific Properties**: Inject custom variables per endpoint on arrival (acting like a built-in *Inject* node). Local properties automatically override global ones in case of key conflicts.
- **Native Look & Feel**: Uses Node-RED's official `typedInput` widgets, offering full support for String, Number, Boolean, JSON, Flow, Global, Env, and Date types with a seamless responsive design.

```bash
npm install @bkmj/node-red-contrib-omni-http
```

## Usage Example: Decoupling Subflows
Instead of configuring environment variables on separate subflow instances (like an api or model subflow), you can inject architecture tokens directly at the edge:
1. In the Global Variables section, add `msg._model` = `"Document"` and `msg._destroy` = `false`.
2. Map your CRUD endpoints below (`GET /entities/document`, `POST /entities/document`, etc.).
3. Connect your shared subflow directly to the output. It will automatically receive the correct model context regardless of which HTTP endpoint was triggered.