# node-red-contrib-omni-http

A Node-RED custom node that creates multiple HTTP endpoints triggering a single flow.
It replaces multiple standard `http in` nodes with a single, clean node using a dynamic routing configuration.

## Install
Run the following command in your Node-RED user directory (typically `~/.node-red`):
`npm install node-red-contrib-omni-http`

## Usage
Add the node to your flow, open its properties, and configure your endpoints (Method + URL).
Attach an `http response` node downstream to complete the requests.