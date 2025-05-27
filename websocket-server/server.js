// Main WebSocket Server
const WebSocket = require('ws');
const { v4: uuidv4 } = require('crypto').randomUUID || (() => Math.random().toString(36));
const config = require('./config');
const SubscriptionManager = require('./subscription-manager');

class TrippliteWebSocketServer {
    constructor() {
        this.subscriptionManager = new SubscriptionManager();
        this.server = null;
        this.isRunning = false;
        
        // Statistics
        this.stats = {
            messagesReceived: 0,
            messagesSent: 0,
            connectionsTotal: 0,
            startTime: null
        };
    }

    /**
     * Start the WebSocket server
     */
    start() {
        if (this.isRunning) {
            this.log('warn', 'Server is already running');
            return;
        }

        this.log('info', `Starting WebSocket server on port ${config.wsPort}`);
        this.log('info', `Configuration: ${JSON.stringify(config.getSummary(), null, 2)}`);

        this.server = new WebSocket.Server({ 
            port: config.wsPort,
            maxPayload: 16 * 1024, // 16KB max message size
        });

        this.server.on('connection', (ws, req) => {
            this.handleConnection(ws, req);
        });

        this.server.on('error', (error) => {
            this.log('error', `Server error: ${error.message}`);
        });

        this.isRunning = true;
        this.stats.startTime = new Date();
        this.log('info', `WebSocket server started successfully on ws://localhost:${config.wsPort}`);
    }

    /**
     * Stop the WebSocket server
     */
    stop() {
        if (!this.isRunning) {
            this.log('warn', 'Server is not running');
            return;
        }

        this.log('info', 'Stopping WebSocket server...');
        
        // Close all client connections
        this.server.clients.forEach(ws => {
            ws.close(1001, 'Server shutting down');
        });

        this.server.close(() => {
            this.log('info', 'WebSocket server stopped');
        });

        this.isRunning = false;
    }

    /**
     * Handle new client connection
     * @param {WebSocket} ws - WebSocket connection
     * @param {IncomingMessage} req - HTTP request object
     */
    handleConnection(ws, req) {
        const clientId = this.generateClientId();
        const clientIP = req.socket.remoteAddress;
        
        this.log('info', `New connection from ${clientIP}, assigned ID: ${clientId}`);
        this.stats.connectionsTotal++;

        // Register client with subscription manager
        if (!this.subscriptionManager.registerClient(ws, clientId)) {
            // Registration failed (likely due to capacity)
            return;
        }

        // Send welcome message
        this.sendToClient(clientId, {
            type: 'welcome',
            clientId: clientId,
            serverTime: new Date().toISOString(),
            config: {
                maxClients: config.maxClients,
                heartbeatInterval: config.heartbeatInterval,
                availableLoads: Array.from({length: 16}, (_, i) => (i + 1).toString())
            }
        });

        // Set up message handling
        ws.on('message', (data) => {
            this.handleMessage(clientId, data);
        });

        // Handle client disconnect
        ws.on('close', (code, reason) => {
            this.log('info', `Client ${clientId} disconnected: ${code} ${reason}`);
            this.subscriptionManager.removeClient(clientId);
        });

        // Handle connection errors
        ws.on('error', (error) => {
            this.log('error', `Client ${clientId} error: ${error.message}`);
            this.subscriptionManager.markClientDisconnected(clientId);
        });

        // Send ping to keep connection alive
        ws.on('pong', () => {
            // Client responded to ping, update last seen
            const client = this.subscriptionManager.clients.get(clientId);
            if (client) {
                client.lastSeen = Date.now();
            }
        });
    }

    /**
     * Handle incoming message from client
     * @param {string} clientId - Client identifier
     * @param {Buffer} data - Raw message data
     */
    handleMessage(clientId, data) {
        this.stats.messagesReceived++;
        
        try {
            const message = JSON.parse(data.toString());
            this.log('debug', `Message from ${clientId}: ${JSON.stringify(message)}`);

            switch (message.type) {
                case 'subscribe':
                    this.handleSubscription(clientId, message);
                    break;
                    
                case 'unsubscribe':
                    this.handleUnsubscription(clientId, message);
                    break;
                    
                case 'ping':
                    this.handlePing(clientId, message);
                    break;
                    
                case 'getStats':
                    this.handleGetStats(clientId, message);
                    break;
                    
                case 'action':
                    // This will be handled by PDU poller in Phase 1b
                    this.handleAction(clientId, message);
                    break;
                    
                default:
                    this.sendToClient(clientId, {
                        type: 'error',
                        error: `Unknown message type: ${message.type}`,
                        originalMessage: message
                    });
            }
        } catch (error) {
            this.log('error', `Failed to parse message from ${clientId}: ${error.message}`);
            this.sendToClient(clientId, {
                type: 'error',
                error: 'Invalid JSON message',
                details: error.message
            });
        }
    }

    /**
     * Handle client subscription request
     * @param {string} clientId - Client identifier
     * @param {Object} message - Subscription message
     */
    handleSubscription(clientId, message) {
        if (!message.loadIds || !Array.isArray(message.loadIds)) {
            this.sendToClient(clientId, {
                type: 'error',
                error: 'loadIds must be an array'
            });
            return;
        }

        const subscribedLoads = this.subscriptionManager.subscribe(clientId, message.loadIds);
        
        if (subscribedLoads === false) {
            this.sendToClient(clientId, {
                type: 'error',
                error: 'Subscription failed - client not found'
            });
            return;
        }

        // Send subscription confirmation with current states
        // Note: In Phase 1b, we'll get actual states from PDU
        const currentStates = subscribedLoads.map(loadId => ({
            loadId: loadId,
            name: `Load${loadId.padStart(2, '0')}`,
            state: 'LOAD_STATE_UNKNOWN', // Placeholder until PDU integration
            lastUpdated: new Date().toISOString()
        }));

        this.sendToClient(clientId, {
            type: 'subscribed',
            loadIds: subscribedLoads,
            currentStates: currentStates,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle client unsubscription request
     * @param {string} clientId - Client identifier
     * @param {Object} message - Unsubscription message
     */
    handleUnsubscription(clientId, message) {
        this.subscriptionManager.unsubscribe(clientId);
        this.sendToClient(clientId, {
            type: 'unsubscribed',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle ping request
     * @param {string} clientId - Client identifier
     * @param {Object} message - Ping message
     */
    handlePing(clientId, message) {
        this.sendToClient(clientId, {
            type: 'pong',
            timestamp: new Date().toISOString(),
            originalMessage: message
        });
    }

    /**
     * Handle stats request
     * @param {string} clientId - Client identifier
     * @param {Object} message - Stats request message
     */
    handleGetStats(clientId, message) {
        const subscriptionStats = this.subscriptionManager.getStats();
        const serverStats = {
            ...this.stats,
            uptime: this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0,
            config: config.getSummary()
        };

        this.sendToClient(clientId, {
            type: 'stats',
            server: serverStats,
            subscriptions: subscriptionStats,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle action request (placeholder for Phase 1b)
     * @param {string} clientId - Client identifier
     * @param {Object} message - Action message
     */
    handleAction(clientId, message) {
        // Placeholder implementation
        this.sendToClient(clientId, {
            type: 'actionResult',
            success: false,
            error: 'PDU actions not yet implemented - coming in Phase 1b',
            originalMessage: message,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Send message to specific client
     * @param {string} clientId - Client identifier
     * @param {Object} message - Message to send
     */
    sendToClient(clientId, message) {
        const sent = this.subscriptionManager.sendToClient(clientId, message);
        if (sent) {
            this.stats.messagesSent++;
        }
        return sent;
    }

    /**
     * Broadcast state change to subscribed clients
     * @param {string} loadId - Load identifier
     * @param {Object} stateChange - State change data
     */
    broadcastStateChange(loadId, stateChange) {
        const message = {
            type: 'stateChange',
            loadId: loadId,
            ...stateChange,
            timestamp: new Date().toISOString()
        };

        const sentCount = this.subscriptionManager.broadcastToLoad(loadId, message);
        this.stats.messagesSent += sentCount;
        return sentCount;
    }

    /**
     * Generate unique client ID
     * @returns {string} Unique client identifier
     */
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get server statistics
     */
    getStats() {
        return {
            server: {
                ...this.stats,
                uptime: this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0,
                isRunning: this.isRunning
            },
            subscriptions: this.subscriptionManager.getStats()
        };
    }

    /**
     * Logging helper
     * @param {string} level - Log level
     * @param {string} message - Log message
     */
    log(level, message) {
        if (config.enableDebug || level !== 'debug') {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [WS-${level.toUpperCase()}] ${message}`);
        }
    }
}

module.exports = TrippliteWebSocketServer; 