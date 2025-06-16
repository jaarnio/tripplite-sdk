// Simple client SDK for connecting to TripplitePDUServer
const WebSocket = require('ws');

class TripplitePDUClient {
    /**
     * Create a new client to connect to TripplitePDUServer
     * @param {Object} options Configuration options
     * @param {string} [options.url='ws://localhost:8081'] WebSocket server URL
     * @param {boolean} [options.autoReconnect=true] Whether to automatically reconnect
     * @param {number} [options.reconnectInterval=5000] Reconnection interval in ms
     * @param {Function} [options.onConnect] Callback when connected
     * @param {Function} [options.onDisconnect] Callback when disconnected
     * @param {Function} [options.onStateChange] Callback when load state changes
     * @param {Function} [options.onActionResult] Callback when action completes
     * @param {Function} [options.onError] Callback for errors
     */
    constructor(options = {}) {
        this.url = options.url || 'ws://localhost:8081';
        this.autoReconnect = options.autoReconnect !== false;
        this.reconnectInterval = options.reconnectInterval || 5000;
        
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
        this.onError = options.onError || ((error) => console.error('PDU Client Error:', error));
        
        // State tracking
        this.loadStates = new Map();
    }

    /**
     * Connect to the PDU server
     * @returns {Promise<void>}
     */
    connect() {
        return new Promise((resolve, reject) => {
            try {
                console.log(`Connecting to ${this.url}...`);
                this.ws = new WebSocket(this.url);

                this.ws.on('open', () => {
                    this.connected = true;
                    console.log('Connected to PDU server');
                    this.onConnect();
                    resolve();
                });

                this.ws.on('message', (data) => {
                    this._handleMessage(data);
                });

                this.ws.on('close', (code, reason) => {
                    this.connected = false;
                    this.clientId = null;
                    console.log(`Disconnected: ${code} ${reason}`);
                    this.onDisconnect(code, reason);
                    
                    if (this.autoReconnect) {
                        this._scheduleReconnect();
                    }
                });

                this.ws.on('error', (error) => {
                    console.error(`WebSocket error: ${error.message}`);
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
     * Subscribe to specific load IDs for real-time updates
     * @param {Array<string|number>} loadIds - Array of load IDs to monitor
     * @returns {boolean} Success
     */
    subscribe(loadIds) {
        if (!this.connected) {
            this.onError(new Error('Not connected to server'));
            return false;
        }

        this.subscribedLoads = loadIds.map(id => id.toString());
        return this._send({
            type: 'subscribe',
            loadIds: this.subscribedLoads
        });
    }

    /**
     * Send action to control a load
     * @param {string|number} loadId - Load ID to control
     * @param {'on'|'off'|'cycle'} action - Action to perform
     * @param {boolean} [byName=false] - Whether loadId is a name instead of ID
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

        return this._send({
            type: 'action',
            loadId: loadId.toString(),
            action: action,
            byName: byName
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
     * Get server statistics
     * @returns {boolean} Success
     */
    getStats() {
        return this._send({ type: 'getStats' });
    }

    /**
     * Send ping to server
     * @returns {boolean} Success
     */
    ping() {
        return this._send({ type: 'ping' });
    }

    // Private methods

    _send(message) {
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

    _handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case 'welcome':
                    this.clientId = message.clientId;
                    console.log(`Connected as client: ${this.clientId}`);
                    break;

                case 'subscribed':
                    console.log(`Subscribed to loads: [${message.loadIds.join(', ')}]`);
                    // Store initial states
                    message.currentStates.forEach(state => {
                        this.loadStates.set(state.id, state);
                    });
                    break;

                case 'stateChange':
                    console.log(`State change: Load ${message.loadId} ${message.previousState} → ${message.currentState}`);
                    // Update stored state
                    this.loadStates.set(message.loadId, message.load);
                    this.onStateChange(message);
                    break;

                case 'actionResult':
                    console.log(`Action result: ${message.action} on Load ${message.loadId} - ${message.success ? 'SUCCESS' : 'FAILED'}`);
                    this.onActionResult(message);
                    break;

                case 'error':
                    console.error(`Server error: ${message.error}`);
                    this.onError(new Error(message.error));
                    break;

                case 'pong':
                    // Ping response
                    break;

                case 'stats':
                    console.log('Server stats:', message.data);
                    break;

                default:
                    console.warn(`Unknown message type: ${message.type}`);
            }
        } catch (error) {
            console.error('Failed to parse message:', error.message);
            this.onError(error);
        }
    }

    _scheduleReconnect() {
        if (this.reconnectTimer) return;

        console.log(`Reconnecting in ${this.reconnectInterval}ms...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect().catch(error => {
                console.error('Reconnection failed:', error.message);
                this._scheduleReconnect();
            });
        }, this.reconnectInterval);
    }
}

module.exports = TripplitePDUClient;
module.exports.default = TripplitePDUClient; 