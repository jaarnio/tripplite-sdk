// Tripplite PDU WebSocket Client SDK
// Easy-to-use client library for building dashboards and applications

const WebSocket = require('ws');

class TripplitePDUClient {
    constructor(options = {}) {
        this.url = options.url || 'ws://localhost:8081';
        this.autoReconnect = options.autoReconnect !== false;
        this.reconnectInterval = options.reconnectInterval || 5000;
        this.name = options.name || 'PDUClient';
        
        this.ws = null;
        this.connected = false;
        this.clientId = null;
        this.subscribedLoads = [];
        this.reconnectTimer = null;
        
        // Event handlers
        this.onConnect = options.onConnect || (() => {});
        this.onDisconnect = options.onDisconnect || (() => {});
        this.onStateChange = options.onStateChange || (() => {});
        this.onActionResult = options.onActionResult || (() => {});
        this.onPDUStatus = options.onPDUStatus || (() => {});
        this.onError = options.onError || ((error) => console.error('PDU Client Error:', error));
        
        // State tracking
        this.loadStates = new Map();
    }

    /**
     * Connect to the WebSocket server
     * @returns {Promise<void>}
     */
    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);

                this.ws.on('open', () => {
                    this.connected = true;
                    this.log('Connected to PDU WebSocket server');
                    this.onConnect();
                    resolve();
                });

                this.ws.on('message', (data) => {
                    this.handleMessage(data);
                });

                this.ws.on('close', (code, reason) => {
                    this.connected = false;
                    this.clientId = null;
                    this.log(`Disconnected: ${code} ${reason}`);
                    this.onDisconnect(code, reason);
                    
                    if (this.autoReconnect) {
                        this.scheduleReconnect();
                    }
                });

                this.ws.on('error', (error) => {
                    this.log(`WebSocket error: ${error.message}`);
                    this.onError(error);
                    if (!this.connected) {
                        reject(error);
                    }
                });

                // Connection timeout
                setTimeout(() => {
                    if (!this.connected) {
                        reject(new Error('Connection timeout'));
                    }
                }, 10000);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Disconnect from the server
     */
    disconnect() {
        this.autoReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
        }
    }

    /**
     * Subscribe to specific load IDs
     * @param {Array<string|number>} loadIds - Array of load IDs to monitor
     * @returns {boolean} Success
     */
    subscribe(loadIds) {
        if (!this.connected) {
            this.onError(new Error('Not connected to server'));
            return false;
        }

        this.subscribedLoads = loadIds.map(id => id.toString());
        return this.send({
            type: 'subscribe',
            loadIds: this.subscribedLoads,
            clientId: this.clientId
        });
    }

    /**
     * Send action to control a load
     * @param {string|number} loadId - Load ID to control
     * @param {string} action - Action: 'on', 'off', or 'cycle'
     * @param {boolean} byName - Whether loadId is a name instead of ID
     * @returns {boolean} Success
     */
    sendAction(loadId, action, byName = false) {
        if (!this.connected) {
            this.onError(new Error('Not connected to server'));
            return false;
        }

        if (!['on', 'off', 'cycle'].includes(action)) {
            this.onError(new Error(`Invalid action: ${action}. Must be 'on', 'off', or 'cycle'`));
            return false;
        }

        return this.send({
            type: 'action',
            loadId: loadId.toString(),
            action: action,
            byName: byName,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get current state of a load
     * @param {string|number} loadId - Load ID
     * @returns {Object|null} Load state or null if not found
     */
    getLoadState(loadId) {
        return this.loadStates.get(loadId.toString()) || null;
    }

    /**
     * Get all current load states
     * @returns {Object} Map of loadId -> state
     */
    getAllLoadStates() {
        const states = {};
        this.loadStates.forEach((state, loadId) => {
            states[loadId] = state;
        });
        return states;
    }

    /**
     * Send ping to server
     * @returns {boolean} Success
     */
    ping() {
        return this.send({
            type: 'ping',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get server statistics
     * @returns {boolean} Success
     */
    getStats() {
        return this.send({
            type: 'getStats'
        });
    }

    // Private methods

    send(message) {
        if (!this.connected || !this.ws) {
            return false;
        }

        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            this.onError(error);
            return false;
        }
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case 'welcome':
                    this.clientId = message.clientId;
                    this.log(`Received client ID: ${this.clientId}`);
                    break;

                case 'subscribed':
                    this.log(`Subscribed to loads: [${message.loadIds.join(', ')}]`);
                    
                    // Store initial states
                    if (message.currentStates) {
                        message.currentStates.forEach(state => {
                            this.loadStates.set(state.loadId, {
                                id: state.loadId,
                                name: state.name,
                                description: state.description,
                                state: state.state,
                                lastUpdated: state.lastUpdated
                            });
                        });
                    }
                    break;

                case 'stateChange':
                    // Update local state
                    this.loadStates.set(message.loadId, {
                        id: message.loadId,
                        name: message.name,
                        description: message.description,
                        state: message.currentState,
                        lastUpdated: message.timestamp
                    });
                    
                    // Call handler
                    this.onStateChange({
                        loadId: message.loadId,
                        name: message.name,
                        description: message.description,
                        previousState: message.previousState,
                        currentState: message.currentState,
                        timestamp: message.timestamp
                    });
                    break;

                case 'actionResult':
                    this.onActionResult({
                        loadId: message.loadId,
                        action: message.action,
                        success: message.success,
                        error: message.error,
                        result: message.result,
                        timestamp: message.timestamp
                    });
                    break;

                case 'pduStatus':
                    this.onPDUStatus({
                        status: message.status,
                        message: message.message,
                        error: message.error,
                        timestamp: message.timestamp
                    });
                    break;

                case 'error':
                    this.onError(new Error(message.error));
                    break;

                case 'pong':
                case 'heartbeat':
                    // Silent - these are handled automatically
                    break;

                default:
                    this.log(`Unknown message type: ${message.type}`);
            }
        } catch (error) {
            this.onError(new Error(`Failed to parse message: ${error.message}`));
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        this.reconnectTimer = setTimeout(() => {
            this.log('Attempting to reconnect...');
            this.connect().then(() => {
                // Re-subscribe to previous loads
                if (this.subscribedLoads.length > 0) {
                    setTimeout(() => {
                        this.subscribe(this.subscribedLoads);
                    }, 1000);
                }
            }).catch((error) => {
                this.log(`Reconnection failed: ${error.message}`);
            });
        }, this.reconnectInterval);
    }

    log(message) {
        console.log(`[${new Date().toLocaleTimeString()}] [${this.name}] ${message}`);
    }
}

// Browser-compatible version (if in browser environment)
if (typeof window !== 'undefined') {
    // Use native WebSocket in browser
    const OriginalWebSocket = WebSocket;
    WebSocket = function(url) {
        return new OriginalWebSocket(url);
    };
    
    // Export for browser
    window.TripplitePDUClient = TripplitePDUClient;
}

module.exports = TripplitePDUClient; 