Creates multiple HTTP endpoints that trigger a single flow with multi-level context injection.

### Outputs

1. Standard Output
: payload (object | string) : For GET/DELETE requests, contains an object of the query parameters. For POST/PUT requests, contains the parsed body.
: req (object) : The Express HTTP request object.
: res (object) : The Express HTTP response object (wrapped inside `{ _res: res }` for native compatibility).
: method (string) : The HTTP method of the request (e.g., GET, POST).
: topic (string) : The URL path of the request.
: [custom property] (any) : Any global or route-specific key/value pair defined in the configurations will be appended to the `msg` object.

### Details

The `omni http in` node allows you to consolidate multiple standard `http in` nodes into a single router. This is ideal for clean REST APIs where multiple methods and paths channel into a unified processing architecture (such as a generic data model engine).

#### Configuration

- **Global Variables**: Properties defined here are applied to the `msg` object for **all** requests hitting this node instance. This is highly recommended for routing tokens like `msg._model` or `msg._destroy`.
- **Endpoints Matrix**: Add as many routes as needed. Slashes at the beginning or end of URLs are automatically cleaned and structured.
- **Route Variables**: Clicking the `+ Variable` button next to an endpoint allows you to inject properties specific to that route.

#### Execution Order & Precedence
When an HTTP request is received, properties are evaluated and injected in the following order:
1. **Global Variables** are injected first.
2. **Route Variables** are injected second. If a route variable shares the exact same key as a global variable, the route variable will **override** the global one.

#### Responding
**Important:** This node only captures incoming requests. You **must** include a native `http response` node downstream to close the request loop and prevent client timeouts.