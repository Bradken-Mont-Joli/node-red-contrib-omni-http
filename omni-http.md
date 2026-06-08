Creates multiple HTTP endpoints that trigger a single flow with dynamic context injection.

### Outputs

1. Standard Output
: payload (object | string) : For GET/DELETE requests, contains an object of the query parameters. For POST/PUT requests, contains the parsed body.
: req (object) : The Express HTTP request object.
: res (object) : The Express HTTP response object (wrapped inside `{ _res: res }` for native compatibility).
: method (string) : The HTTP method of the request (e.g., GET, POST).
: topic (string) : The URL path of the request.
: [custom property] (any) : Any custom key/value pair defined in the route matrix will be appended to the `msg` object.

### Details

The `omni http in` node allows you to consolidate multiple standard `http in` nodes into a single router. This is ideal for REST APIs where multiple methods and paths need to be channeled into the same processing architecture (like a unified data model subflow).

#### Configuration
- **Endpoints Matrix**: Add as many routes as needed. Slashes at the beginning or end of URLs are automatically cleaned and structured.
- **Property Injection**: For each endpoint, you can dynamically assign a variable to the `msg` object (e.g., `msg.action = "fetch"`). Numbers, booleans, and JSON strings are automatically parsed into their correct JavaScript types.

#### Responding
**Important:** This node only captures incoming requests. You **must** include a native `http response` node downstream to close the request loop and prevent client timeouts.