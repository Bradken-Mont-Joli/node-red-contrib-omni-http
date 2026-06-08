const bodyParser = require("body-parser"); // 🟢 1. Appel du parseur natif de Node-RED

module.exports = function(RED) {
    "use strict";

    // 🟢 2. Configuration des middlewares de parsing (limite à 10mb pour éviter les crashs)
    const jsonParser = bodyParser.json({ limit: "10mb" });
    const urlencParser = bodyParser.urlencoded({ limit: "10mb", extended: true });

    function OmniHttpNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.routes = config.routes || [];
        this.globalProps = config.globalProps || []; 
        var app = RED.httpNode;

        this.routes.forEach(r => {
            const method = r.method ? r.method.toLowerCase() : null;
            const url = r.url;

            if (method && url && typeof app[method] === 'function') {
                
                var routeCallback = function(req, res) {
                    var msg = {
                        req: req,
                        res: { _res: res },
                        // 🟢 Le req.body sera maintenant parfaitement peuplé !
                        payload: req.method === "GET" ? req.query : req.body, 
                        topic: req.url,
                        method: req.method
                    };

                    // Injections Globales
                    if (node.globalProps && Array.isArray(node.globalProps)) {
                        node.globalProps.forEach(p => {
                            try {
                                let evaluatedVal = RED.util.evaluateNodeProperty(p.val, p.type, node, msg);
                                RED.util.setMessageProperty(msg, p.key, evaluatedVal, true);
                            } catch (err) {
                                node.error("Erreur d'injection globale : " + err.message);
                            }
                        });
                    }

                    // Injections Spécifiques
                    if (r.props && Array.isArray(r.props)) {
                        r.props.forEach(p => {
                            try {
                                let evaluatedVal = RED.util.evaluateNodeProperty(p.val, p.type, node, msg);
                                RED.util.setMessageProperty(msg, p.key, evaluatedVal, true);
                            } catch (err) {
                                node.error("Erreur d'injection spécifique : " + err.message);
                            }
                        });
                    }

                    node.send(msg);
                };

                // 🟢 3. On intercale les parseurs entre la route et le callback !
                app[method](url, jsonParser, urlencParser, routeCallback);
                
                r.registeredCallback = routeCallback;
            }
        });

        this.on("close", function() {
            node.routes.forEach(r => {
                const method = r.method ? r.method.toLowerCase() : null;
                const url = r.url;
                if (method && url && r.registeredCallback) {
                    for (var i = app._router.stack.length - 1; i >= 0; i--) {
                        var layer = app._router.stack[i];
                        if (layer.route && layer.route.path === url && layer.route.methods[method]) {
                            app._router.stack.splice(i, 1);
                        }
                    }
                }
            });
        });
    }
    RED.nodes.registerType("omni-http", OmniHttpNode);
}