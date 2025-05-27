// Subscription Manager for WebSocket clients
const config = require('./config');

class SubscriptionManager {
    constructor() {
        // Map of clientId -> { ws, loadIds, lastSeen }
        this.clients = new Map();
        
        // Map of loadId -> Set of clientIds interested in this load
        this.subscriptions = new Map();
        
        // Initialize all possible loadIds (1-16 for typical PDU)
        for (let i = 1; i <= 16; i++) {
            this.subscriptions.set(i.toString(), new Set());
        }
        
        this.startHeartbeat();
    }

    /**
     * Register a new client connection
     * @param {WebSocket} ws - WebSocket connection
     * @param {string} clientId - Unique client identifier
     */
    registerClient(ws, clientId) {
        if (this.clients.size >= config.maxClients) {
            this.log('warn', `Maximum clients (${config.maxClients}) reached, rejecting client: ${clientId}`);
            ws.close(1013, 'Server at capacity');
            return false;
        }

        this.clients.set(clientId, {
            ws: ws,
            loadIds: [],
            lastSeen: Date.now(),
            connected: true
        });

        this.log('info', `Client registered: ${clientId} (${this.clients.size}/${config.maxClients})`);
        return true;
    }

    /**
     * Subscribe client to specific loadIds
     * @param {string} clientId - Client identifier
     * @param {Array<string>} loadIds - Array of load IDs to subscribe to
     */
    subscribe(clientId, loadIds) {
        const client = this.clients.get(clientId);
        if (!client) {
            this.log('warn', `Subscription attempt from unknown client: ${clientId}`);
            return false;
        }

        // Remove client from previous subscriptions
        this.unsubscribe(clientId);

        // Validate and subscribe to new loadIds
        const validLoadIds = loadIds.filter(id => {
            const loadId = id.toString();
            return this.subscriptions.has(loadId);
        });

        validLoadIds.forEach(loadId => {
            this.subscriptions.get(loadId.toString()).add(clientId);
        });

        // Update client record
        client.loadIds = validLoadIds;
        client.lastSeen = Date.now();

        this.log('info', `Client ${clientId} subscribed to loads: [${validLoadIds.join(', ')}]`);
        return validLoadIds;
    }

    /**
     * Unsubscribe client from all loadIds
     * @param {string} clientId - Client identifier
     */
    unsubscribe(clientId) {
        const client = this.clients.get(clientId);
        if (!client) return;

        // Remove client from all load subscriptions
        client.loadIds.forEach(loadId => {
            const subscribers = this.subscriptions.get(loadId.toString());
            if (subscribers) {
                subscribers.delete(clientId);
            }
        });

        client.loadIds = [];
        this.log('debug', `Client ${clientId} unsubscribed from all loads`);
    }

    /**
     * Remove client completely
     * @param {string} clientId - Client identifier
     */
    removeClient(clientId) {
        this.unsubscribe(clientId);
        this.clients.delete(clientId);
        this.log('info', `Client removed: ${clientId} (${this.clients.size}/${config.maxClients})`);
    }

    /**
     * Send message to specific client
     * @param {string} clientId - Client identifier
     * @param {Object} message - Message to send
     */
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client || !client.connected) {
            this.log('warn', `Cannot send to client ${clientId}: not connected`);
            return false;
        }

        try {
            client.ws.send(JSON.stringify(message));
            client.lastSeen = Date.now();
            return true;
        } catch (error) {
            this.log('error', `Failed to send message to client ${clientId}: ${error.message}`);
            this.markClientDisconnected(clientId);
            return false;
        }
    }

    /**
     * Broadcast message to clients subscribed to specific loadId
     * @param {string} loadId - Load identifier
     * @param {Object} message - Message to broadcast
     */
    broadcastToLoad(loadId, message) {
        const subscribers = this.subscriptions.get(loadId.toString());
        if (!subscribers || subscribers.size === 0) {
            this.log('debug', `No subscribers for load ${loadId}`);
            return 0;
        }

        let sentCount = 0;
        subscribers.forEach(clientId => {
            if (this.sendToClient(clientId, message)) {
                sentCount++;
            }
        });

        this.log('debug', `Broadcast to load ${loadId}: ${sentCount}/${subscribers.size} clients`);
        return sentCount;
    }

    /**
     * Broadcast message to all connected clients
     * @param {Object} message - Message to broadcast
     */
    broadcastToAll(message) {
        let sentCount = 0;
        this.clients.forEach((client, clientId) => {
            if (this.sendToClient(clientId, message)) {
                sentCount++;
            }
        });

        this.log('debug', `Broadcast to all: ${sentCount}/${this.clients.size} clients`);
        return sentCount;
    }

    /**
     * Mark client as disconnected
     * @param {string} clientId - Client identifier
     */
    markClientDisconnected(clientId) {
        const client = this.clients.get(clientId);
        if (client) {
            client.connected = false;
        }
    }

    /**
     * Get current subscription statistics
     */
    getStats() {
        const loadStats = {};
        this.subscriptions.forEach((subscribers, loadId) => {
            loadStats[loadId] = subscribers.size;
        });

        return {
            totalClients: this.clients.size,
            connectedClients: Array.from(this.clients.values()).filter(c => c.connected).length,
            maxClients: config.maxClients,
            loadSubscriptions: loadStats
        };
    }

    /**
     * Start heartbeat to detect disconnected clients
     */
    startHeartbeat() {
        setInterval(() => {
            const now = Date.now();
            const disconnectedClients = [];

            this.clients.forEach((client, clientId) => {
                if (now - client.lastSeen > config.clientTimeout) {
                    disconnectedClients.push(clientId);
                }
            });

            // Remove disconnected clients
            disconnectedClients.forEach(clientId => {
                this.log('info', `Client ${clientId} timed out, removing`);
                this.removeClient(clientId);
            });

            // Send heartbeat to connected clients
            this.broadcastToAll({
                type: 'heartbeat',
                timestamp: new Date().toISOString(),
                stats: this.getStats()
            });

        }, config.heartbeatInterval);
    }

    /**
     * Logging helper
     * @param {string} level - Log level
     * @param {string} message - Log message
     */
    log(level, message) {
        if (config.enableDebug || level !== 'debug') {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [SUBS-${level.toUpperCase()}] ${message}`);
        }
    }
}

module.exports = SubscriptionManager; 