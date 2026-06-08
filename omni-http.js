module.exports = function(RED) {
    "use strict";
    function OmniHttpNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.routes = config.routes || [];
        var app = RED.httpNode;

        this.callback = function(req, res) {
            var msg = {
                req: req, res: res,
                payload: req.method === "GET" ? req.query : req.body,
                topic: req.url, method: req.method
            };
            node.send(msg);
        };

        // Enregistrement des routes
        this.routes.forEach(r => {
            if (r.method && r.url) app[r.method](r.url, node.callback);
        });

        // Nettoyage à la fermeture
        this.on("close", function() {
            node.routes.forEach(r => {
                for (var i = app._router.stack.length - 1; i >= 0; i--) {
                    var layer = app._router.stack[i];
                    if (layer.route && layer.route.path === r.url && layer.route.methods[r.method]) {
                        app._router.stack.splice(i, 1);
                    }
                }
            });
        });
    }
    RED.nodes.registerType("omni-http", OmniHttpNode);
}