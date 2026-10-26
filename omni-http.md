Creates multiple HTTP endpoints that trigger a single flow with multi-level context injection, or acts as a direct in-memory `link in` target for internal `link call` nodes.

### Outputs

1. Standard Output
: payload (object | string) : For HTTP GET/DELETE requests, contains an object of the URL query parameters. For POST/PUT/PATCH requests, contains the parsed body. When called via an internal `link call` node, carries the query parameters or the input payload.
: req (object) : The Express HTTP request object. When triggered internally via `link call`, contains a simulated request object providing identical properties (`method`, `url`, `query`, `params`, `headers`, and `_isInternalLinkCall = true`).
: res (object) : The Express HTTP response object wrapped inside `{ _res: res }` for native Node-RED compatibility. When triggered via `link call`, contains a virtual Express response interceptor.
: method (string) : The HTTP method of the request in uppercase (e.g., `GET`, `POST`, `PUT`, `DELETE`, `PATCH`).
: topic (string) : The matched URL route path of the request.
: [custom property] (any) : Any global or route-specific key/value pair defined in the node configurations will be evaluated and appended to the `msg` object.

### Details

The `omni http in` node allows you to consolidate multiple standard `http in` nodes into a single, maintainable router matrix. This is ideal for clean REST APIs where multiple HTTP verbs and paths channel into a unified processing architecture, such as a generic subflow, a data model engine, or an automated workflow.

In addition to serving external HTTP traffic, this node can act as an internal microservice router within Node-RED by accepting execution directly from native `link call` nodes with zero network overhead.

#### Configuration

* **Name**: The display name of the node in the editor. When using dynamic `link call` targeting, `msg.target` can be set to this exact name (e.g., `"/planning/assembly"`) to route messages directly to this node in memory.


* **Act as Link In**: When enabled, the node registers an internal input listener. Any `link call` node can target this node (either statically or dynamically via `msg.target` or `msg.url`). The node will automatically parse route parameters (such as `:_id`), merge query parameters, simulate `msg.req`/`msg.res`, and inject variables as if an external HTTP client called the endpoint.


* **Global Variables**: Properties defined here are applied to the `msg` object for **all** requests hitting this node instance, regardless of which endpoint was triggered. This is highly recommended for routing tokens such as `msg._model` or `msg._destroy` to decouple downstream subflows.


* **Endpoints Matrix**: Add as many routes as needed. Slashes at the beginning or end of URLs are automatically cleaned, and the configured system `httpNodeRoot` prefix is displayed dynamically. Express parameter placeholders (e.g., `:id`, `:_id`, `:code`) are fully supported and will populate `msg.req.params`.


* **Route Variables**: Clicking the `+ Variable` button next to an endpoint allows you to inject properties specific to that particular route. Supports all Node-RED `typedInput` types: String, Number, Boolean, JSON, Date, Environment variable, Flow context, and Global context.

#### Execution Order & Precedence

When a request is received (via HTTP or `link call`), properties are evaluated and injected in the following strict order:

1. **Global Variables** are evaluated and injected into `msg` first.


2. **Route Variables** matching the triggered endpoint are evaluated and injected second. If a route variable shares the exact same property key as a global variable, the route variable will **override** the global one.

#### Responding & Lifecycle Termination

**Important:** This node only captures and routes incoming requests. You must pair it downstream with a response node to close the request loop and prevent client timeouts:

* **Using `omni-reply` (Recommended)**: The companion `omni-reply` node provides seamless dual-mode termination. If the request originated from an external HTTP client, it sends the standard Express response with native `[ERR_HTTP_HEADERS_SENT]` protection. If the request was triggered internally via a `link call`, it automatically detects `msg._linkSource` and returns execution directly to the calling node in memory with zero latency. In both cases, it automatically purges `msg.req` and `msg.res` to prevent memory leaks.


* **Using Native `http response**`: If you do not use `omni-reply`, you can still route to a native `http response` node. When `Act as Link In` is enabled, `omni-http` provides a built-in virtual response interceptor that catches the native node's output and safely redirects it back to the calling `link call` node.