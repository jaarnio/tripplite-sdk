// Unified Tripplite PDU SDK with integrated WebSocket server
// Load environment variables first, before loading any other modules
try {
    require('dotenv').config();
} catch (error) {
    // dotenv is optional, continue without it if not available
}

const WebSocket = require('ws');
const auth = require('./lib/auth');
const loadService = require('./lib/load-service');
const config = require('./lib/config');

// Extract default exports if they exist, otherwise use the module directly
const authInstance = auth.default || auth;
const loadServiceInstance = loadService.default || loadService;
const configInstance = config.default || config;

class TripplitePDUServer {
    /**
     * Create a new TripplitePDU server with integrated WebSocket functionality
     * @param {Object} options Configuration options
     * @param {string} options.host The IP address or hostname of the PDU
     * @param {number} [options.port=443] The PDU API port number
     * @param {string} options.username Username for PDU authentication
     * @param {string} options.password Password for PDU authentication
     * @param {number} [options.deviceId=1] PDU Device ID
     * @param {number} [options.wsPort=8081] WebSocket server port
     * @param {number} [options.maxClients=16] Maximum WebSocket clients
     * @param {number} [options.pollInterval=5000] Polling interval in milliseconds
     * @param {boolean} [options.autoStart=false] Whether to start server automatically
     */
    constructor(options = {}) {
        // Configure PDU connection
        configInstance.configure(options);
        
        // WebSocket server configuration
        this.wsPort = options.wsPort || parseInt(process.env.WS_PORT) || 8081;
        this.maxClients = options.maxClients || parseInt(process.env.WS_MAX_CLIENTS) || 16;
        this.pollInterval = options.pollInterval || parseInt(process.env.PDU_POLL_INTERVAL) || 5000;
        this.heartbeatInterval = options.heartbeatInterval || parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000;
        this.clientTimeout = options.clientTimeout || parseInt(process.env.WS_CLIENT_TIMEOUT) || 60000;
        this.enableDebug = options.enableDebug || process.env.WS_DEBUG === 'true' || false;
        
        // Internal state
        this.isRunning = false;
        this.wsServer = null;
        this.pollTimer = null;
        this.heartbeatTimer = null;
        
        // Client and subscription management
        this.clients = new Map(); // clientId -> { ws, loadIds, lastSeen }
        this.subscriptions = new Map(); // loadId -> Set of clientIds
        this.lastKnownStates = new Map(); // loadId -> state
        
        // Initialize subscription map for loads 1-16 (typical PDU)
        for (let i = 1; i <= 16; i++) {
            this.subscriptions.set(i.toString(), new Set());
        }
        
        // Statistics
        this.stats = {
            startTime: null,
            pollCount: 0,
            stateChanges: 0,
            messagesReceived: 0,
            messagesSent: 0,
            connectionsTotal: 0,
            errors: 0
        };
        
        // Auto-start if requested
        if (options.autoStart) {
            this.start().catch(error => {
                this.log('error', `Auto-start failed: ${error.message}`);
            });
        }
    }

    /**
     * Start the PDU server (WebSocket server + polling)
     * @returns {Promise<void>}
     */
    async start() {
        if (this.isRunning) {
            this.log('warn', 'Server is already running');
            return;
        }

        try {
            this.log('info', `Starting Tripplite PDU Server on port ${this.wsPort}`);
            this.log('info', `Configuration: PDU=${configInstance.getBaseUrl()}, Poll=${this.pollInterval}ms, MaxClients=${this.maxClients}`);

            // Test PDU connection first
            await this._testPDUConnection();
            
            // Start WebSocket server
            await this._startWebSocketServer();
            
            // Start polling
            await this._startPolling();
            
            // Start heartbeat
            this._startHeartbeat();
            
            this.isRunning = true;
            this.stats.startTime = new Date();
            
            this.log('info', `Tripplite PDU Server started successfully!`);
            this.log('info', `WebSocket server: ws://localhost:${this.wsPort}`);
            this.log('info', `Ready for client connections (max ${this.maxClients})`);
            
        } catch (error) {
            this.log('error', `Failed to start server: ${error.message}`);
            await this.stop(); // Clean up any partially started components
            throw error;
        }
    }

    /**
     * Stop the PDU server
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.isRunning) {
            this.log('warn', 'Server is not running');
            return;
        }

        this.log('info', 'Stopping Tripplite PDU Server...');
        this.isRunning = false;

        // Stop polling
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        // Stop heartbeat
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        // Close all client connections
        this.clients.forEach((client, clientId) => {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.close(1001, 'Server shutting down');
            }
        });
        this.clients.clear();
        this.subscriptions.forEach(set => set.clear());

        // Close WebSocket server
        if (this.wsServer) {
            await new Promise(resolve => {
                this.wsServer.close(() => {
                    this.log('info', 'WebSocket server closed');
                    resolve();
                });
            });
            this.wsServer = null;
        }

        // Logout from PDU
        try {
            await authInstance.logout();
            this.log('info', 'PDU session logged out');
        } catch (error) {
            this.log('warn', `Error during PDU logout: ${error.message}`);
        }

        this.log('info', 'Tripplite PDU Server stopped');
    }

    /**
     * Get server statistics
     * @returns {Object} Server statistics
     */
    getStats() {
        const uptime = this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0;
        return {
            ...this.stats,
            uptime,
            isRunning: this.isRunning,
            connectedClients: this.clients.size,
            wsPort: this.wsPort,
            pollInterval: this.pollInterval,
            lastPoll: this.lastKnownStates.size > 0 ? new Date().toISOString() : null
        };
    }

    /**
     * Get the WebSocket server port
     * @returns {number} Port number
     */
    getPort() {
        return this.wsPort;
    }

    /**
     * Get current load states
     * @returns {Array} Array of load states
     */
    getCurrentStates() {
        return Array.from(this.lastKnownStates.values());
    }

    /**
     * Direct API access: Get all loads
     * @returns {Promise<Array>} Array of load objects
     */
    async getAllLoads() {
        await this._ensureAuthenticated();
        return loadServiceInstance.getAllLoads();
    }

    /**
     * Direct API access: Perform load action
     * @param {string|number} id The load ID
     * @param {'on'|'off'|'cycle'} action The action to perform
     * @returns {Promise<Object>} Action response
     */
    async performLoadAction(id, action) {
        await this._ensureAuthenticated();
        const result = await loadServiceInstance.performLoadAction(id, action, false);
        
        // If server is running, trigger immediate poll to broadcast changes
        if (this.isRunning) {
            setTimeout(() => this._pollPDU(), 100);
        }
        
        return result;
    }

    /**
     * Direct API access: Get load by ID
     * @param {string|number} id The load ID
     * @returns {Promise<Object>} Load status
     */
    async getLoadById(id) {
        await this._ensureAuthenticated();
        const result = await loadServiceInstance.getLoadById(id);
        return this._formatLoadResponse(result);
    }

    // Private methods

    async _testPDUConnection() {
        this.log('info', 'Testing PDU connection...');
        const loads = await this.getAllLoads();
        this.log('info', `PDU connection successful! Found ${loads.length} loads`);
        
        // Store initial states
        loads.forEach(load => {
            this.lastKnownStates.set(load.id, {
                id: load.id,
                name: load.name,
                description: load.description,
                state: load.state,
                lastUpdated: new Date().toISOString()
            });
        });
    }

    async _startWebSocketServer() {
        return new Promise((resolve, reject) => {
            this.wsServer = new WebSocket.Server({ 
                port: this.wsPort,
                maxPayload: 16 * 1024 // 16KB max message size
            });

            this.wsServer.on('connection', (ws, req) => {
                this._handleConnection(ws, req);
            });

            this.wsServer.on('error', (error) => {
                this.log('error', `WebSocket server error: ${error.message}`);
                reject(error);
            });

            this.wsServer.on('listening', () => {
                this.log('info', `WebSocket server listening on port ${this.wsPort}`);
                resolve();
            });
        });
    }

    async _startPolling() {
        this.log('info', `Starting PDU polling with ${this.pollInterval}ms interval`);
        
        // Initial poll
        await this._pollPDU();
        
        // Set up regular polling
        this.pollTimer = setInterval(() => {
            this._pollPDU().catch(error => {
                this.stats.errors++;
                this.log('error', `Poll error: ${error.message}`);
            });
        }, this.pollInterval);
    }

    _startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            this._performHeartbeat();
        }, this.heartbeatInterval);
    }

    _handleConnection(ws, req) {
        const clientId = this._generateClientId();
        const clientIP = req.socket.remoteAddress;
        
        if (this.clients.size >= this.maxClients) {
            this.log('warn', `Maximum clients (${this.maxClients}) reached, rejecting ${clientIP}`);
            ws.close(1013, 'Server at capacity');
            return;
        }

        this.log('info', `New client connected from ${clientIP}: ${clientId}`);
        this.stats.connectionsTotal++;

        // Register client
        this.clients.set(clientId, {
            ws: ws,
            loadIds: [],
            lastSeen: Date.now(),
            connected: true
        });

        // Send welcome message
        this._sendToClient(clientId, {
            type: 'welcome',
            clientId: clientId,
            serverTime: new Date().toISOString(),
            availableLoads: Array.from({length: 16}, (_, i) => (i + 1).toString())
        });

        // Set up event handlers
        ws.on('message', (data) => {
            this._handleMessage(clientId, data);
        });

        ws.on('close', (code, reason) => {
            this.log('info', `Client ${clientId} disconnected: ${code} ${reason}`);
            this._removeClient(clientId);
        });

        ws.on('error', (error) => {
            this.log('error', `Client ${clientId} error: ${error.message}`);
            this._removeClient(clientId);
        });

        ws.on('pong', () => {
            const client = this.clients.get(clientId);
            if (client) {
                client.lastSeen = Date.now();
            }
        });
    }

    _handleMessage(clientId, data) {
        this.stats.messagesReceived++;
        
        try {
            const message = JSON.parse(data.toString());
            this.log('debug', `Message from ${clientId}: ${message.type}`);

            switch (message.type) {
                case 'subscribe':
                    this._handleSubscription(clientId, message);
                    break;
                case 'action':
                    this._handleAction(clientId, message);
                    break;
                case 'ping':
                    this._sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
                    break;
                case 'getStats':
                    this._sendToClient(clientId, { type: 'stats', data: this.getStats() });
                    break;
                default:
                    this._sendToClient(clientId, {
                        type: 'error',
                        error: `Unknown message type: ${message.type}`
                    });
            }
        } catch (error) {
            this.log('error', `Failed to parse message from ${clientId}: ${error.message}`);
            this._sendToClient(clientId, {
                type: 'error',
                error: 'Invalid JSON message'
            });
        }
    }

    _handleSubscription(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;

        // Unsubscribe from previous subscriptions
        client.loadIds.forEach(loadId => {
            this.subscriptions.get(loadId)?.delete(clientId);
        });

        // Subscribe to new loads
        const validLoadIds = message.loadIds.filter(id => {
            const loadId = id.toString();
            return this.subscriptions.has(loadId);
        });

        validLoadIds.forEach(loadId => {
            this.subscriptions.get(loadId.toString()).add(clientId);
        });

        client.loadIds = validLoadIds;
        client.lastSeen = Date.now();

        // Send current states for subscribed loads
        const currentStates = validLoadIds.map(loadId => 
            this.lastKnownStates.get(loadId.toString())
        ).filter(Boolean);

        this._sendToClient(clientId, {
            type: 'subscribed',
            loadIds: validLoadIds,
            currentStates: currentStates
        });

        this.log('info', `Client ${clientId} subscribed to loads: [${validLoadIds.join(', ')}]`);
    }

    async _handleAction(clientId, message) {
        try {
            const { loadId, action, byName } = message;
            
            this.log('info', `Action from ${clientId}: ${action} on ${byName ? 'name' : 'ID'} ${loadId}`);
            
            const result = await loadServiceInstance.performLoadAction(loadId, action, byName);
            
            this._sendToClient(clientId, {
                type: 'actionResult',
                loadId: loadId,
                action: action,
                success: result.data?.attributes?.response === 0,
                result: result
            });

            // Trigger immediate poll to broadcast state changes
            setTimeout(() => this._pollPDU(), 100);
            
        } catch (error) {
            this.log('error', `Action failed for ${clientId}: ${error.message}`);
            this._sendToClient(clientId, {
                type: 'actionResult',
                loadId: message.loadId,
                action: message.action,
                success: false,
                error: error.message
            });
        }
    }

    async _pollPDU() {
        try {
            this.stats.pollCount++;
            this.log('debug', `Polling PDU... (poll #${this.stats.pollCount})`);
            
            // Ensure we have valid authentication before polling
            await this._ensureAuthenticated();
            
            const currentLoads = await this.getAllLoads();
            const changes = this._detectStateChanges(currentLoads);
            
            if (changes.length > 0) {
                this.log('info', `Detected ${changes.length} state changes`);
                this.stats.stateChanges += changes.length;
                
                changes.forEach(change => {
                    this._broadcastStateChange(change);
                });
            }
            
        } catch (error) {
            this.stats.errors++;
            
            // Handle authentication errors more comprehensively
            if (error.message.includes('401') || error.message.includes('Unauthorized') || 
                error.message.includes('Authentication') || error.message.includes('token')) {
                this.log('warn', `Authentication issue detected: ${error.message}`);
                try {
                    // Force a fresh login instead of just refresh
                    authInstance.accessToken = null;
                    authInstance.refreshToken = null;
                    authInstance.tokenExpiry = null;
                    
                    await authInstance.login();
                    this.log('info', 'Re-authentication successful after error');
                } catch (authError) {
                    this.log('error', `Re-authentication failed: ${authError.message}`);
                }
            } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
                this.log('error', `Network connectivity issue: ${error.message}`);
            } else {
                this.log('error', `PDU poll failed: ${error.message}`);
            }
        }
    }

    _detectStateChanges(currentLoads) {
        const changes = [];
        
        currentLoads.forEach(load => {
            const lastKnown = this.lastKnownStates.get(load.id);
            if (!lastKnown || lastKnown.state !== load.state) {
                const change = {
                    loadId: load.id,
                    previousState: lastKnown?.state || null,
                    currentState: load.state,
                    timestamp: new Date().toISOString(),
                    load: load
                };
                changes.push(change);
                
                // Update stored state
                this.lastKnownStates.set(load.id, {
                    id: load.id,
                    name: load.name,
                    description: load.description,
                    state: load.state,
                    lastUpdated: new Date().toISOString()
                });
            }
        });
        
        return changes;
    }

    _broadcastStateChange(change) {
        const subscribers = this.subscriptions.get(change.loadId);
        if (!subscribers || subscribers.size === 0) return;

        const message = {
            type: 'stateChange',
            ...change
        };

        let sentCount = 0;
        subscribers.forEach(clientId => {
            if (this._sendToClient(clientId, message)) {
                sentCount++;
            }
        });

        this.log('debug', `Broadcast state change for load ${change.loadId}: ${sentCount}/${subscribers.size} clients`);
    }

    _sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client || !client.connected || client.ws.readyState !== WebSocket.OPEN) {
            return false;
        }

        try {
            client.ws.send(JSON.stringify(message));
            client.lastSeen = Date.now();
            this.stats.messagesSent++;
            return true;
        } catch (error) {
            this.log('error', `Failed to send to client ${clientId}: ${error.message}`);
            this._removeClient(clientId);
            return false;
        }
    }

    _removeClient(clientId) {
        const client = this.clients.get(clientId);
        if (client) {
            // Remove from all subscriptions
            client.loadIds.forEach(loadId => {
                this.subscriptions.get(loadId)?.delete(clientId);
            });
        }
        this.clients.delete(clientId);
        this.log('debug', `Client removed: ${clientId}`);
    }

    _performHeartbeat() {
        const now = Date.now();
        const timeoutThreshold = now - this.clientTimeout;
        
        this.clients.forEach((client, clientId) => {
            if (client.lastSeen < timeoutThreshold) {
                this.log('info', `Client ${clientId} timed out`);
                this._removeClient(clientId);
            } else if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.ping();
            }
        });
    }

    _generateClientId() {
        return 'client_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
    }

    async _ensureAuthenticated() {
        if (!authInstance.getAccessToken()) {
            await authInstance.login();
            return;
        }
        
        if (authInstance.needsRefresh()) {
            await authInstance.refreshAccessToken();
            return;
        }
    }

    _formatLoadResponse(response) {
        if (!response || !response.data || !response.data.attributes) {
            throw new Error('Invalid response format');
        }

        return {
            id: response.data.id,
            name: response.data.attributes.name,
            description: response.data.attributes.description,
            state: response.data.attributes.state
        };
    }

    log(level, message) {
        if (!this.enableDebug && level === 'debug') return;
        
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}] [TripplitePDU]`;
        console.log(`${prefix} ${message}`);
    }
}

// Export the unified class
module.exports = TripplitePDUServer;
module.exports.default = TripplitePDUServer;