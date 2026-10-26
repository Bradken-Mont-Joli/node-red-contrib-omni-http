const bodyParser = require("body-parser"); 
const cors = require("cors");
const urlModule = require("url");

module.exports = function(RED) {
    "use strict";

    const jsonParser = bodyParser.json({ limit: "10mb" });
    const urlencParser = bodyParser.urlencoded({ limit: "10mb", extended: true });

    // =========================================================================
    // 🔍 UTILITAIRES : Matching d'URL Express & Normalisation pour Link Call
    // =========================================================================
    function matchExpressRoute(routePattern, actualPath) {
        const cleanPattern = (routePattern || "").replace(/^\/+|\/+$/g, "");
        const cleanActual = (actualPath || "").replace(/^\/+|\/+$/g, "");

        const pSegments = cleanPattern ? cleanPattern.split("/") : [];
        const aSegments = cleanActual ? cleanActual.split("/") : [];

        if (pSegments.length !== aSegments.length) return null;

        const params = {};
        for (let i = 0; i < pSegments.length; i++) {
            if (pSegments[i].startsWith(":")) {
                const paramName = pSegments[i].substring(1);
                params[paramName] = decodeURIComponent(aSegments[i]);
            } else if (pSegments[i].toLowerCase() !== aSegments[i].toLowerCase()) {
                return null;
            }
        }
        return params;
    }

    function normalizeIncomingUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== "string") return { pathname: "", query: {} };
        let cleaned = rawUrl.trim();
        // Retire protocole + host éventuel
        cleaned = cleaned.replace(/^https?:\/\/[^\/]+/i, "");
        // Retire le préfixe httpNodeRoot (ex: /api) s'il est spécifié
        const root = (RED.settings.httpNodeRoot || "/").replace(/\/+$/, "");
        if (root && root !== "" && cleaned.toLowerCase().startsWith(root.toLowerCase() + "/")) {
            cleaned = cleaned.substring(root.length);
        }
        const parsed = urlModule.parse(cleaned, true);
        return {
            pathname: parsed.pathname || "",
            query: parsed.query ? Object.assign({}, parsed.query) : {}
        };
    }

    // =========================================================================
    // 🌐 NŒUD 1 : OMNI-HTTP (Entrée Multi-Routes + Act as Link In)
    // =========================================================================
    function OmniHttpNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.routes = config.routes || [];
        this.globalProps = config.globalProps || [];
        this.actAsLinkIn = Boolean(config.actAsLinkIn);
        var app = RED.httpNode;

        var corsHandler = null;
        if (RED.settings.httpNodeCors) {
            corsHandler = cors(RED.settings.httpNodeCors);
        }

        function injectProperties(msg, matchedRoute) {
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

            if (matchedRoute && matchedRoute.props && Array.isArray(matchedRoute.props)) {
                matchedRoute.props.forEach(p => {
                    try {
                        let evaluatedVal = RED.util.evaluateNodeProperty(p.val, p.type, node, msg);
                        RED.util.setMessageProperty(msg, p.key, evaluatedVal, true);
                    } catch (err) {
                        node.error("Erreur d'injection spécifique : " + err.message);
                    }
                });
            }
        }

        // 1. Enregistrement des routes Express HTTP
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

                    injectProperties(msg, r);
                    node.send(msg);
                };

                if (corsHandler && typeof app.options === 'function') {
                    app.options(url, corsHandler);
                }

                var routeMiddlewares = [];
                if (corsHandler) {
                    routeMiddlewares.push(corsHandler);
                }
                routeMiddlewares.push(jsonParser);
                routeMiddlewares.push(urlencParser);
                routeMiddlewares.push(routeCallback);

                app[method](url, ...routeMiddlewares);
                r.registeredCallback = routeCallback;
            }
        });

        // 2. Mode "Act as Link In" (Appels internes via Link Call)
        if (this.actAsLinkIn) {
            this.on("input", function(msg, send, done) {
                try {
                    const reqMethod = (msg.method || "GET").toUpperCase();
                    const rawUrl = msg.url || msg.topic || node.name || (node.routes[0] && node.routes[0].url) || "";
                    const { pathname, query } = normalizeIncomingUrl(rawUrl);

                    let matchedRoute = null;
                    let extractedParams = {};

                    for (const r of node.routes) {
                        if ((r.method || "get").toUpperCase() === reqMethod) {
                            const params = matchExpressRoute(r.url, pathname);
                            if (params !== null) {
                                matchedRoute = r;
                                extractedParams = params;
                                break;
                            }
                        }
                    }

                    if (!matchedRoute) {
                        matchedRoute = node.routes.find(r => (r.method || "get").toUpperCase() === reqMethod) || node.routes[0] || null;
                    }

                    let finalQuery = Object.assign({}, query);
                    let finalBody = msg.payload;

                    if (reqMethod === "GET" || reqMethod === "DELETE") {
                        if (msg.payload && typeof msg.payload === "object" && !Array.isArray(msg.payload)) {
                            finalQuery = Object.assign({}, msg.payload, finalQuery);
                        }
                        msg.payload = finalQuery;
                    }

                    msg.req = {
                        method: reqMethod,
                        url: pathname || rawUrl,
                        query: finalQuery,
                        params: Object.assign({}, msg.params || {}, extractedParams),
                        body: finalBody,
                        headers: msg.headers || {},
                        _isInternalLinkCall: true
                    };
                    msg.method = reqMethod;
                    msg.topic = msg.req.url;

                    // Intercepteur virtuel pour fermeture automatique si routé vers un nœud http response classique
                    let responseDispatched = false;
                    const returnToLinkCaller = function(finalPayload) {
                        if (responseDispatched) return;
                        responseDispatched = true;

                        if (finalPayload !== undefined) {
                            msg.payload = finalPayload;
                        }
                        delete msg.req;
                        delete msg.res;

                        if (Array.isArray(msg._linkSource) && msg._linkSource.length > 0) {
                            const linkInfo = msg._linkSource.pop();
                            const callerNode = RED.nodes.getNode(linkInfo.node);
                            if (callerNode && typeof callerNode.returnLinkMessage === "function") {
                                callerNode.returnLinkMessage(msg);
                            }
                        }
                    };

                    const virtualRes = {
                        headersSent: false,
                        statusCode: 200,
                        _headers: {},
                        set: function(k, v) {
                            if (typeof k === "object") Object.assign(this._headers, k);
                            else this._headers[k] = v;
                            return this;
                        },
                        setHeader: function(k, v) { this._headers[k] = v; return this; },
                        getHeader: function(k) { return this._headers[k]; },
                        status: function(code) {
                            this.statusCode = code;
                            msg.statusCode = code;
                            return this;
                        },
                        sendStatus: function(code) {
                            this.statusCode = code;
                            msg.statusCode = code;
                            this.headersSent = true;
                            returnToLinkCaller(null);
                            return this;
                        },
                        json: function(data) {
                            this.headersSent = true;
                            returnToLinkCaller(data);
                            return this;
                        },
                        send: function(data) {
                            this.headersSent = true;
                            if (typeof data === "string") {
                                try { data = JSON.parse(data); } catch (e) {}
                            }
                            returnToLinkCaller(data);
                            return this;
                        },
                        end: function(data) {
                            this.headersSent = true;
                            returnToLinkCaller(data);
                            return this;
                        }
                    };

                    msg.res = {
                        _res: virtualRes,
                        headersSent: false
                    };

                    injectProperties(msg, matchedRoute);
                    send(msg);
                    if (done) done();
                } catch (err) {
                    if (done) done(err);
                    else node.error(err, msg);
                }
            });
        }

        this.on("close", function() {
            node.routes.forEach(r => {
                const method = r.method ? r.method.toLowerCase() : null;
                const url = r.url;
                if (method && url && app && app._router && app._router.stack) {
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

    // =========================================================================
    // 📤 NŒUD 2 : OMNI-REPLY (Réponse Hybride HTTP + Link Call + Anti-Leak)
    // =========================================================================
    function OmniReplyNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.statusCode = config.statusCode;
        this.headers = config.headers || {};
        this.showStatus = config.showStatus !== false;

        this.on("input", function(msg, send, done) {
            try {
                const code = parseInt(node.statusCode || msg.statusCode || 200, 10);
                msg.statusCode = code;
                const durationTxt = msg.apiCall?.time ? ` (${msg.apiCall.time})` : "";

                // -----------------------------------------------------------------
                // 🔗 CAS 1 : RETOUR DE LINK CALL INTERNE (Mémoire pure, 0 ms)
                // -----------------------------------------------------------------
                if (Array.isArray(msg._linkSource) && msg._linkSource.length > 0) {
                    delete msg.req;
                    delete msg.res;

                    const linkInfo = msg._linkSource.pop();
                    const callerNode = RED.nodes.getNode(linkInfo.node);

                    if (callerNode && typeof callerNode.returnLinkMessage === "function") {
                        if (node.showStatus) {
                            node.status({
                                fill: code >= 400 ? "red" : (code === 204 ? "yellow" : "blue"),
                                shape: "dot",
                                text: `Link ${code}${durationTxt}`
                            });
                        }
                        callerNode.returnLinkMessage(msg);
                    } else {
                        node.warn(`[omni-reply] Nœud Link Call appelant introuvable (${linkInfo.node})`);
                    }

                    send(msg);
                    if (done) done();
                    return;
                }

                // -----------------------------------------------------------------
                // 🌐 CAS 2 : RÉPONSE HTTP EXPRESS STANDARD
                // -----------------------------------------------------------------
                const res = msg.res?._res || msg.res;

                if (msg.req && res && typeof res.status === "function") {
                    // Protection native contre [ERR_HTTP_HEADERS_SENT]
                    if (res.headersSent || msg.res.headersSent) {
                        node.warn("[omni-reply] Headers already sent, dropping duplicate HTTP response.");
                        delete msg.req;
                        delete msg.res;
                        if (done) done();
                        return;
                    }

                    // 1. Application des en-têtes
                    const combinedHeaders = Object.assign({}, node.headers, msg.headers || {});
                    Object.keys(combinedHeaders).forEach(hKey => {
                        if (combinedHeaders[hKey] !== undefined && combinedHeaders[hKey] !== null) {
                            res.set(hKey, combinedHeaders[hKey]);
                        }
                    });

                    // 2. Application des cookies
                    if (msg.cookies && typeof msg.cookies === "object") {
                        Object.keys(msg.cookies).forEach(cName => {
                            const cVal = msg.cookies[cName];
                            if (cVal === null || cVal === undefined) {
                                res.clearCookie(cName);
                            } else if (typeof cVal === "object" && "value" in cVal) {
                                res.cookie(cName, cVal.value, cVal);
                            } else {
                                res.cookie(cName, cVal);
                            }
                        });
                    }

                    // 3. Émission selon le code et le type de payload
                    res.status(code);

                    if (code === 204 || msg.payload === null || msg.payload === undefined) {
                        res.end();
                    } else if (Buffer.isBuffer(msg.payload)) {
                        res.send(msg.payload);
                    } else if (typeof msg.payload === "object") {
                        res.jsonp ? res.jsonp(msg.payload) : res.json(msg.payload);
                    } else {
                        res.send(String(msg.payload));
                    }

                    if (node.showStatus) {
                        node.status({
                            fill: code >= 500 ? "red" : (code >= 400 ? "orange" : (code === 204 ? "yellow" : "green")),
                            shape: "dot",
                            text: `${msg.req.method || 'HTTP'} ${code}${durationTxt}`
                        });
                    }

                    // 4. Nettoyage mémoire anti-fuite de sockets
                    delete msg.req;
                    delete msg.res;

                    send(msg);
                    if (done) done();
                    return;
                }

                // -----------------------------------------------------------------
                // 🧹 CAS 3 : PAYLOAD NON HTTP (Message résiduel ou Test)
                // -----------------------------------------------------------------
                delete msg.req;
                delete msg.res;
                send(msg);
                if (done) done();

            } catch (err) {
                delete msg.req;
                delete msg.res;
                if (done) done(err);
                else node.error(err, msg);
            }
        });
    }
    RED.nodes.registerType("omni-reply", OmniReplyNode);
    
    // =========================================================================
    // 📞 NŒUD 3 : OMNI-LINK-CALL (Appelant Universel de sous-flux)
    // =========================================================================
    function OmniLinkCallNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.timeout = config.timeout || 30; // Timeout par défaut de 30 secondes
        this.linkType = config.linkType || "static";
        this.links = config.links || []; // IDs des nœuds cibles statiques

        // Stockage des callbacks en attente (clés par _msgid)
        node.activeCalls = {};

        // Méthode publique exposée pour que omni-reply ou un nœud Return natif puisse refermer la boucle
        this.returnLinkMessage = function(msg) {
            var msgId = msg._msgid;
            if (node.activeCalls[msgId]) {
                clearTimeout(node.activeCalls[msgId].timeoutTimer);
                var sendCb = node.activeCalls[msgId].send;
                var doneCb = node.activeCalls[msgId].done;
                delete node.activeCalls[msgId];
                
                // Transmet le message retourné au flux appelant
                sendCb(msg);
                if (doneCb) doneCb();
            }
        };

        this.on("input", function(msg, send, done) {
            
            // 1. Identification du/des nœuds cibles
            let targetNodes = [];
            
            if (node.linkType === "dynamic") {
                // Routage dynamique basé sur msg.target
                const targetName = msg.target || msg.url || msg.topic;
                if (!targetName) {
                    if (done) done("omni-link-call dynamique nécessite msg.target, msg.url ou msg.topic");
                    else node.error("omni-link-call dynamique nécessite msg.target, msg.url ou msg.topic", msg);
                    return;
                }
                
                // Recherche exhaustive dans l'espace de travail Node-RED
                RED.nodes.eachNode(function(n) {
                    if (n.type === "link in" || n.type === "omni-http") {
                        if (n.name === targetName) {
                            const activeNode = RED.nodes.getNode(n.id);
                            if (activeNode) targetNodes.push(activeNode);
                        }
                    }
                });
                
                if (targetNodes.length === 0) {
                    node.warn(`[omni-link-call] Cible dynamique introuvable : ${targetName}`);
                    if (done) done();
                    return;
                }
            } else {
                // Routage statique basé sur les IDs liés dans l'éditeur UI
                node.links.forEach(id => {
                    const activeNode = RED.nodes.getNode(id);
                    if (activeNode) targetNodes.push(activeNode);
                });
                
                if (targetNodes.length === 0) {
                    node.warn(`[omni-link-call] Aucun nœud cible statique configuré ou introuvable.`);
                    if (done) done();
                    return;
                }
            }

            // Si plusieurs cibles sont trouvées, on prend la première pour éviter la duplication des messages de retour
            const targetNode = targetNodes[0];

            // 2. Traçabilité pour le retour (Injection de soi-même dans l'historique du msg)
            if (!Array.isArray(msg._linkSource)) {
                msg._linkSource = [];
            }
            // On s'enregistre comme le point d'origine du sous-flux
            msg._linkSource.push({ node: node.id });

            // 3. Mise en attente avec Timeout de sécurité
            node.activeCalls[msg._msgid] = {
                send: send,
                done: done,
                timeoutTimer: setTimeout(function() {
                    if (node.activeCalls[msg._msgid]) {
                        delete node.activeCalls[msg._msgid];
                        const err = `Timeout de ${node.timeout}s atteint lors de l'appel au sous-flux.`;
                        if (done) done(err);
                        else node.error(err, msg);
                    }
                }, node.timeout * 1000)
            };

            // 4. Déclenchement Asynchrone de la cible (Bascule vers le sous-flux)
            try {
                // On déclenche l'événement "input" du nœud de réception
                targetNode.receive(msg);
            } catch (err) {
                if (node.activeCalls[msg._msgid]) {
                    clearTimeout(node.activeCalls[msg._msgid].timeoutTimer);
                    delete node.activeCalls[msg._msgid];
                }
                if (done) done(err);
                else node.error("Erreur lors du déclenchement du Link In : " + err.message, msg);
            }
        });

        this.on("close", function() {
            // Nettoyage de tous les timeouts actifs lors du redéploiement
            Object.keys(node.activeCalls).forEach(function(msgId) {
                clearTimeout(node.activeCalls[msgId].timeoutTimer);
            });
            node.activeCalls = {};
        });
    }
    RED.nodes.registerType("omni-link-call", OmniLinkCallNode);
};