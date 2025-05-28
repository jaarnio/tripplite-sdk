// Main WebSocket Server
const WebSocket = require('ws');
const { v4: uuidv4 } = require('crypto').randomUUID || (() => Math.random().toString(36));
const config = require('./config');
const SubscriptionManager = require('./subscription-manager');
const PDUPoller = require('./pdu-poller');

class TrippliteWebSocketServer {
    constructor() {
        this.subscriptionManager = new SubscriptionManager();
        this.pduPoller = new PDUPoller(this);
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
    async start() {
        if (this.isRunning) {
            this.log('warn', 'Server is already running');
            return;
        }

        try {
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

            // Start PDU poller
            this.log('info', 'Starting PDU poller...');
            await this.pduPoller.start();
            this.log('info', 'PDU poller started successfully');

        } catch (error) {
            this.log('error', `Failed to start server: ${error.message}`);
            this.isRunning = false;
            throw error;
        }
    }

    /**
     * Stop the WebSocket server
     */
    async stop() {
        if (!this.isRunning) {
            this.log('warn', 'Server is not running');
            return;
        }

        this.log('info', 'Stopping WebSocket server...');
        
        // Stop PDU poller first
        await this.pduPoller.stop();
        
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

        // Get real current states from PDU poller
        const currentStates = subscribedLoads.map(loadId => {
            const pduState = this.pduPoller.getCurrentLoadState(loadId);
            return {
                loadId: loadId,
                name: pduState ? pduState.name : `Load${loadId.padStart(2, '0')}`,
                description: pduState ? pduState.description : `Load ${loadId}`,
                state: pduState ? pduState.state : 'LOAD_STATE_UNKNOWN',
                lastUpdated: pduState ? pduState.lastUpdated : new Date().toISOString()
            };
        });

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
     * Handle action request - now fully implemented
     * @param {string} clientId - Client identifier
     * @param {Object} message - Action message
     */
    async handleAction(clientId, message) {
        // Validate message format
        if (!message.loadId || !message.action) {
            this.sendToClient(clientId, {
                type: 'actionResult',
                success: false,
                error: 'loadId and action are required',
                timestamp: new Date().toISOString()
            });
            return;
        }

        // Validate action type
        const validActions = ['on', 'off', 'cycle'];
        if (!validActions.includes(message.action)) {
            this.sendToClient(clientId, {
                type: 'actionResult',
                success: false,
                error: `Invalid action. Must be one of: ${validActions.join(', ')}`,
                timestamp: new Date().toISOString()
            });
            return;
        }

        try {
            this.log('info', `Client ${clientId} requesting action "${message.action}" on load ${message.loadId}`);
            
            // Perform action through PDU poller
            const result = await this.pduPoller.performLoadAction(
                message.loadId, 
                message.action, 
                message.byName || false
            );

            // Send success response to requesting client
            this.sendToClient(clientId, {
                type: 'actionResult',
                loadId: message.loadId,
                action: message.action,
                success: true,
                result: result,
                timestamp: new Date().toISOString()
            });

            this.log('info', `Action "${message.action}" on load ${message.loadId} completed successfully`);

        } catch (error) {
            this.log('error', `Action "${message.action}" on load ${message.loadId} failed: ${error.message}`);
            
            // Send error response to requesting client
            this.sendToClient(clientId, {
                type: 'actionResult',
                loadId: message.loadId,
                action: message.action,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
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
     * @param {string} loadId - Load ID that changed
     * @param {Object} stateChange - State change details
     */
    broadcastStateChange(loadId, stateChange) {
        const subscribedClients = this.subscriptionManager.getClientsForLoad(loadId);
        
        if (subscribedClients.length > 0) {
            const message = {
                type: 'stateChange',
                loadId: loadId,
                name: stateChange.name,
                description: stateChange.description,
                previousState: stateChange.previousState,
                currentState: stateChange.currentState,
                timestamp: stateChange.timestamp
            };

            subscribedClients.forEach(clientId => {
                this.sendToClient(clientId, message);
            });

            this.log('info', `Broadcasted state change for load ${loadId} to ${subscribedClients.length} clients`);
        }
    }

    /**
     * Generate unique client ID
     * @returns {string} Unique client identifier
     */
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get detailed server statistics including PDU poller stats
     */
    getStats() {
        const uptime = this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0;
        const subscriptionStats = this.subscriptionManager.getStats();
        const pduStats = this.pduPoller.getStats();
        
        return {
            server: {
                isRunning: this.isRunning,
                port: config.wsPort,
                uptime: uptime,
                startTime: this.stats.startTime,
                messagesReceived: this.stats.messagesReceived,
                messagesSent: this.stats.messagesSent,
                connectionsTotal: this.stats.connectionsTotal,
                activeConnections: this.server ? this.server.clients.size : 0
            },
            subscriptions: subscriptionStats,
            pdu: pduStats,
            config: config.getSummary()
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