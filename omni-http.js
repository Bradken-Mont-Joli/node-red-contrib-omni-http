module.exports = function(RED) {
    "use strict";
    function OmniHttpNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.routes = config.routes || [];
        var app = RED.httpNode;

        this.routes.forEach(r => {
            const method = r.method ? r.method.toLowerCase() : null;
            const url = r.url;

            if (method && url && typeof app[method] === 'function') {
                
                var routeCallback = function(req, res) {
                    var msg = {
                        req: req,
                        res: { _res: res }, // Protection d'enveloppe anti-crash
                        payload: req.method === "GET" ? req.query : req.body,
                        topic: req.url,
                        method: req.method
                    };

                    // 🟢 EVALUATION ET INJECTION EXACTE DES VARIABLES (STYLE INTERNE NODE-RED)
                    if (r.props && Array.isArray(r.props)) {
                        r.props.forEach(p => {
                            try {
                                // Résout la valeur selon son type (String, Number, Env, Flow, Global, etc.)
                                let evaluatedVal = RED.util.evaluateNodeProperty(p.val, p.type, node, msg);
                                
                                // Écrit proprement la valeur dans le msg, gère le dot-notation (ex: payload.id)
                                RED.util.setMessageProperty(msg, p.key, evaluatedVal, true);
                            } catch (err) {
                                node.error("Erreur d'injection de variable : " + err.message);
                            }
                        });
                    }

                    node.send(msg);
                };

                app[method](url, routeCallback);
                r.registeredCallback = routeCallback;
            }
        });

        // Nettoyage de la pile Express au redéploiement
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