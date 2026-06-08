Creates multiple HTTP endpoints that trigger a single flow.

### Outputs

1. Standard Output
: payload (object | string) : For GET/DELETE requests, contains an object of the query string parameters. For POST/PUT/PATCH requests, contains the parsed body of the request.
: req (object) : The Express HTTP request object.
: res (object) : The Express HTTP response object.
: method (string) : The HTTP method of the request (e.g., GET, POST).
: topic (string) : The URL path of the request.

### Details

The `omni http in` node allows you to consolidate multiple standard `http in` nodes into a single, clean node. This is highly useful when building REST APIs where multiple methods and paths (e.g., `GET /api/item`, `POST /api/item`, and `PUT /api/item/:id`) need to be routed to the same core processing flow.

#### Configuration
Use the **Endpoints** list in the node's properties to add as many routes as you need. For each endpoint, select the HTTP **Method** and define the **URL** (e.g., `/entities/document/:_id`).

#### Responding
**Note:** Just like the standard `http in` node, this node only receives the request and does not send a response back to the client. You **must** connect an `http response` node somewhere downstream in your flow to complete the request and prevent the client from timing out.