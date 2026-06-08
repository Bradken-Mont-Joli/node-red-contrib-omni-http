const bodyParser = require("body-parser"); 
const cors = require("cors"); // 🟢 1. Appel du module CORS (Garanti d'être présent car Node-RED en dépend)

module.exports = function(RED) {
    "use strict";

    // Configuration des middlewares de parsing (limite à 10mb pour éviter les crashs)
    const jsonParser = bodyParser.json({ limit: "10mb" });
    const urlencParser = bodyParser.urlencoded({ limit: "10mb", extended: true });

    function OmniHttpNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.routes = config.routes || [];
        this.globalProps = config.globalProps || []; 
        var app = RED.httpNode;

        // 🟢 2. Récupération et initialisation du gestionnaire CORS officiel de Node-RED
        var corsHandler = null;
        if (RED.settings.httpNodeCors) {
            corsHandler = cors(RED.settings.httpNodeCors);
        }

        this.routes.forEach(r => {
            const method = r.method ? r.method.toLowerCase() : null;
            const url = r.url;

            if (method && url && typeof app[method] === 'function') {
                
                var routeCallback = function(req, res) {
                    var msg = {
                        req: req,
                        res: { _res: res },
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

                // 🟢 3. Enregistrement de la route OPTIONS pour le Preflight CORS du navigateur
                if (corsHandler && typeof app.options === 'function') {
                    app.options(url, corsHandler);
                }

                // 🟢 4. Assemblage dynamique de la chaîne de middlewares
                var routeMiddlewares = [];
                if (corsHandler) {
                    routeMiddlewares.push(corsHandler);
                }
                routeMiddlewares.push(jsonParser);
                routeMiddlewares.push(urlencParser);
                routeMiddlewares.push(routeCallback);

                // Application de la route avec tous ses intercepteurs
                app[method](url, ...routeMiddlewares);
                
                r.registeredCallback = routeCallback;
            }
        });

        this.on("close", function() {
            node.routes.forEach(r => {
                const method = r.method ? r.method.toLowerCase() : null;
                const url = r.url;
                if (method && url) {
                    // 🟢 5. Nettoyage de la route principale ET de la route OPTIONS du routeur Express
                    for (var i = app._router.stack.length - 1; i >= 0; i--) {
                        var layer = app._router.stack[i];
                        if (layer.route && layer.route.path === url) {
                            if (layer.route.methods[method] || layer.route.methods['options']) {
                                app._router.stack.splice(i, 1);
                            }
                        }
                    }
                }
            });
        });
    }
    RED.nodes.registerType("omni-http", OmniHttpNode);
}