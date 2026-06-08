module.exports = function(RED) {
    "use strict";
    function OmniHttpNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.routes = config.routes || [];
        var app = RED.httpNode;

        // Établissement des connexions de routes
        this.routes.forEach(r => {
            const method = r.method ? r.method.toLowerCase() : null;
            const url = r.url;

            if (method && url && typeof app[method] === 'function') {
                
                // Définition d'un callback isolé par route (Closure)
                var routeCallback = function(req, res) {
                    var msg = {
                        req: req,
                        res: { _res: res }, // File-safe enveloppe pour l'intégration Node-RED
                        payload: req.method === "GET" ? req.query : req.body,
                        topic: req.url,
                        method: req.method
                    };

                    // 🟢 INJECTION DE LA PROPRIÉTÉ PERSONNALISÉE
                    if (r.propKey && r.propKey.trim() !== "") {
                        let targetKey = r.propKey.trim();
                        let targetVal = r.propVal;

                        // Auto-casting intelligent des types de données
                        if (targetVal === "true") targetVal = true;
                        else if (targetVal === "false") targetVal = false;
                        else if (!isNaN(targetVal) && targetVal.trim() !== "") targetVal = Number(targetVal);
                        else {
                            try {
                                // Tente de décoder si l'utilisateur a écrit un objet ou tableau JSON
                                targetVal = JSON.parse(targetVal);
                            } catch (e) {
                                // Reste une chaîne de caractères brute si le parsing échoue
                            }
                        }

                        // Écrit la propriété dans le message (écrase ou ajoute)
                        msg[targetKey] = targetVal;
                    }

                    node.send(msg);
                };

                // Enregistrement de la route auprès d'Express
                app[method](url, routeCallback);

                // Sauvegarde de la référence de la fonction pour pouvoir la purger proprement au close
                r.registeredCallback = routeCallback;
            }
        });

        // Nettoyage strict du routeur Express lors d'un déploiement
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