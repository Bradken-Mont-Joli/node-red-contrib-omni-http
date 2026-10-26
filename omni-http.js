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
        cleaned = cleaned.replace(/^https?:\/\/[^\/]+/i, "");
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
                if (corsHandler) routeMiddlewares.push(corsHandler);
                routeMiddlewares.push(jsonParser);
                routeMiddlewares.push(urlencParser);
                routeMiddlewares.push(routeCallback);

                app[method](url, ...routeMiddlewares);
                r.registeredCallback = routeCallback;
            }
        });

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
                            // 🟢 Compatibilité avec le format natif
                            const callerNode = RED.nodes.getNode(linkInfo.id || linkInfo.node);
                            if (callerNode && typeof callerNode.returnLinkMessage === "function") {
                                // 🟢 Support double signature
                                callerNode.returnLinkMessage(linkInfo.msgId || msg._msgid, msg);
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
                    // 🟢 Compatibilité avec link call natif
                    const callerNode = RED.nodes.getNode(linkInfo.id || linkInfo.node);

                    if (callerNode && typeof callerNode.returnLinkMessage === "function") {
                        if (node.showStatus) {
                            node.status({
                                fill: code >= 400 ? "red" : (code === 204 ? "yellow" : "blue"),
                                shape: "dot",
                                text: `Link ${code}${durationTxt}`
                            });
                        }
                        // 🟢 Support double signature Node-RED 3+ (sourceMsgId, msg)
                        callerNode.returnLinkMessage(linkInfo.msgId || msg._msgid, msg);
                    } else {
                        node.warn(`[omni-reply] Nœud Link Call appelant introuvable (${linkInfo.node || linkInfo.id})`);
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
                    if (res.headersSent || msg.res.headersSent) {
                        node.warn("[omni-reply] Headers already sent, dropping duplicate HTTP response.");
                        delete msg.req;
                        delete msg.res;
                        if (done) done();
                        return;
                    }

                    const combinedHeaders = Object.assign({}, node.headers, msg.headers || {});
                    Object.keys(combinedHeaders).forEach(hKey => {
                        if (combinedHeaders[hKey] !== undefined && combinedHeaders[hKey] !== null) {
                            res.set(hKey, combinedHeaders[hKey]);
                        }
                    });

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

                    delete msg.req;
                    delete msg.res;

                    send(msg);
                    if (done) done();
                    return;
                }

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
        this.timeout = config.timeout || 30; 
        this.linkType = config.linkType || "dynamic";
        this.links = config.links || []; 
        this.showStatus = config.showStatus !== false; 
        this.showDuration = config.showDuration !== false;

        node.activeCalls = {};

        // 🟢 UTILITAIRE DE STATUT UI
        const updateUiStatus = (code, durationMs, isError = false, errMsg = "") => {
            if (!node.showStatus && !node.showDuration && !isError) {
                node.status({});
                return;
            }
            if (isError) {
                node.status({ fill: "red", shape: "dot", text: errMsg });
                return;
            }
            
            let txtParts = [];
            if (node.showStatus) {
                txtParts.push(`Code ${code}`);
            }
            if (node.showDuration && durationMs !== null) {
                txtParts.push(`${durationMs}ms`);
            }
            
            let fillCol = "green";
            if (code >= 500) fillCol = "red";
            else if (code >= 400) fillCol = "orange";
            else if (code === 204) fillCol = "yellow";

            node.status({ fill: fillCol, shape: "dot", text: txtParts.join(" | ") });
        };

        this.returnLinkMessage = function(arg1, arg2) {
            var msg = arg2 !== undefined ? arg2 : arg1;
            var msgId = (arg2 !== undefined ? arg1 : msg._msgid) || msg._msgid;

            if (node.activeCalls[msgId]) {
                clearTimeout(node.activeCalls[msgId].timeoutTimer);
                var sendCb = node.activeCalls[msgId].send;
                var doneCb = node.activeCalls[msgId].done;
                
                // 🟢 FIN DU CHRONO
                var startTime = node.activeCalls[msgId].startTime;
                let durationMs = null;
                if (startTime) {
                    durationMs = Date.now() - startTime;
                }
                const code = parseInt(msg.statusCode || 200, 10);
                updateUiStatus(code, durationMs);
                
                // RESTAURATION DU CONTEXTE DE ROUTAGE D'ORIGINE
                if (node.activeCalls[msgId].originalTopic !== undefined) {
                    msg.topic = node.activeCalls[msgId].originalTopic;
                } else {
                    delete msg.topic;
                }

                if (node.activeCalls[msgId].originalUrl !== undefined) {
                    msg.url = node.activeCalls[msgId].originalUrl;
                } else {
                    delete msg.url;
                }

                if (node.activeCalls[msgId].originalTarget !== undefined) {
                    msg.target = node.activeCalls[msgId].originalTarget;
                } else {
                    delete msg.target;
                }

                delete node.activeCalls[msgId];
                
                sendCb(msg);
                if (doneCb) doneCb();
            }
        };

        this.on("input", function(msg, send, done) {
            let targetNodes = [];
            
            if (node.linkType === "dynamic") {
                const targetName = msg.target || msg.url || msg.topic;
                if (!targetName) {
                    updateUiStatus(null, null, true, "Cible non spécifiée");
                    if (done) done("omni-link-call dynamique nécessite msg.target, msg.url ou msg.topic");
                    else node.error("omni-link-call dynamique nécessite msg.target, msg.url ou msg.topic", msg);
                    return;
                }
                
                RED.nodes.eachNode(function(n) {
                    if (n.type === "link in" || n.type === "omni-http") {
                        if (n.name === targetName) {
                            const activeNode = RED.nodes.getNode(n.id);
                            if (activeNode) targetNodes.push(activeNode);
                        }
                    }
                });
                
                if (targetNodes.length === 0) {
                    updateUiStatus(null, null, true, "Cible introuvable");
                    node.warn(`[omni-link-call] Cible dynamique introuvable : ${targetName}`);
                    if (done) done();
                    return;
                }
            } else {
                node.links.forEach(id => {
                    const activeNode = RED.nodes.getNode(id);
                    if (activeNode) targetNodes.push(activeNode);
                });
                
                if (targetNodes.length === 0) {
                    updateUiStatus(null, null, true, "Aucune cible configurée");
                    node.warn(`[omni-link-call] Aucun nœud cible statique configuré ou introuvable.`);
                    if (done) done();
                    return;
                }
            }

            const targetNode = targetNodes[0];

            // Sauvegarde du contexte
            const originalTopic = msg.topic;
            const originalUrl = msg.url;
            const originalTarget = msg.target;

            if (!Array.isArray(msg._linkSource)) {
                msg._linkSource = [];
            }
            
            msg._linkSource.push({
                id: node.id,
                node: node.id,
                msgId: msg._msgid
            });

            // 🟢 DÉBUT DU CHRONO
            const startTime = Date.now();

            node.activeCalls[msg._msgid] = {
                send: send,
                done: done,
                startTime: startTime,
                originalTopic: originalTopic,
                originalUrl: originalUrl,
                originalTarget: originalTarget,
                timeoutTimer: setTimeout(function() {
                    if (node.activeCalls[msg._msgid]) {
                        delete node.activeCalls[msg._msgid];
                        const err = `Timeout de ${node.timeout}s atteint lors de l'appel au sous-flux.`;
                        updateUiStatus(null, null, true, "Timeout");
                        if (done) done(err);
                        else node.error(err, msg);
                    }
                }, node.timeout * 1000)
            };

            try {
                if (node.showStatus || node.showDuration) {
                    node.status({ fill: "blue", shape: "ring", text: "Appel en cours..." });
                }
                targetNode.receive(msg);
            } catch (err) {
                if (node.activeCalls[msg._msgid]) {
                    clearTimeout(node.activeCalls[msg._msgid].timeoutTimer);
                    delete node.activeCalls[msg._msgid];
                }
                updateUiStatus(null, null, true, "Erreur d'appel");
                if (done) done(err);
                else node.error("Erreur lors du déclenchement du Link In : " + err.message, msg);
            }
        });

        this.on("close", function() {
            Object.keys(node.activeCalls).forEach(function(msgId) {
                clearTimeout(node.activeCalls[msgId].timeoutTimer);
            });
            node.activeCalls = {};
        });
    }
    RED.nodes.registerType("omni-link-call", OmniLinkCallNode);
};