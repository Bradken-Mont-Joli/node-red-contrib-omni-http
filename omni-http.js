module.exports = function(RED) {
    "use strict";
    function OmniHttpNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.routes = config.routes || [];
        this.globalProps = config.globalProps || []; // 🟢 Capture de la configuration globale
        var app = RED.httpNode;

        this.routes.forEach(r => {
            const method = r.method ? r.method.toLowerCase() : null;
            const url = r.url;

            if (method && url && typeof app[method] === 'function') {
                
                var routeCallback = function(req, res) {
                    var msg = {
                        req: req,
                        res: { _res: res }, // Protection anti-crash de structure Node-RED
                        payload: req.method === "GET" ? req.query : req.body,
                        topic: req.url,
                        method: req.method
                    };

                    // 🟢 ÉTAPE 1 : ENCLENCHEMENT DES INJECTIONS GLOBALES DE L'INSTANCE
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

                    // 🟢 ÉTAPE 2 : ENCLENCHEMENT DES INJECTIONS SPÉCIFIQUES À LA ROUTE (OVERRIDE POTENTIEL)
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

                app[method](url, routeCallback);
                r.registeredCallback = routeCallback;
            }
        });

        // Nettoyage au redéploiement
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