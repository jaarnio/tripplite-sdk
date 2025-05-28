// PDU Poller Service - Polls real PDU and detects state changes
const TripplitePDU = require('../dist/index');
const config = require('./config');

class PDUPoller {
    constructor(webSocketServer) {
        this.wsServer = webSocketServer;
        this.pdu = null;
        this.isPolling = false;
        this.pollInterval = null;
        this.lastKnownStates = new Map(); // loadId -> state
        this.retryCount = 0;
        this.maxRetries = config.maxRetries;
        this.retryDelay = config.retryDelay;
        this.pollIntervalMs = config.pollInterval;
        
        // Statistics
        this.stats = {
            pollCount: 0,
            stateChanges: 0,
            errors: 0,
            lastPoll: null,
            lastStateChange: null,
            startTime: null
        };
    }

    /**
     * Start polling the PDU
     */
    async start() {
        if (this.isPolling) {
            this.log('warn', 'PDU poller is already running');
            return;
        }

        try {
            this.log('info', 'Starting PDU poller...');
            
            // Initialize PDU connection using environment variables
            this.pdu = new TripplitePDU();
            
            // Test initial connection
            this.log('info', 'Testing PDU connection...');
            const initialLoads = await this.pdu.getAllLoads();
            this.log('info', `PDU connection successful! Found ${initialLoads.length} loads`);
            
            // Store initial states
            initialLoads.forEach(load => {
                this.lastKnownStates.set(load.id, {
                    id: load.id,
                    name: load.name,
                    description: load.description,
                    state: load.state,
                    lastUpdated: new Date().toISOString()
                });
            });

            // Start polling
            this.isPolling = true;
            this.stats.startTime = new Date();
            this.retryCount = 0;
            
            this.pollInterval = setInterval(() => {
                this.pollPDU().catch(error => {
                    this.log('error', `Poll error: ${error.message}`);
                });
            }, this.pollIntervalMs);

            this.log('info', `PDU poller started with ${this.pollIntervalMs}ms interval`);
            
            // Do initial poll immediately
            await this.pollPDU();
            
        } catch (error) {
            this.log('error', `Failed to start PDU poller: ${error.message}`);
            this.isPolling = false;
            throw error;
        }
    }

    /**
     * Stop polling the PDU
     */
    async stop() {
        if (!this.isPolling) {
            this.log('warn', 'PDU poller is not running');
            return;
        }

        this.log('info', 'Stopping PDU poller...');
        this.isPolling = false;
        
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }

        // Cleanup PDU connection
        if (this.pdu) {
            try {
                await this.pdu.logout();
                this.log('info', 'PDU session logged out successfully');
            } catch (error) {
                this.log('warn', `Error during PDU logout: ${error.message}`);
            }
            this.pdu = null;
        }

        this.log('info', 'PDU poller stopped');
    }

    /**
     * Poll the PDU for current state
     */
    async pollPDU() {
        if (!this.isPolling) return;

        try {
            this.stats.pollCount++;
            this.stats.lastPoll = new Date().toISOString();
            
            this.log('debug', `Polling PDU... (poll #${this.stats.pollCount})`);
            
            // Get all current loads
            const currentLoads = await this.pdu.getAllLoads();
            
            // Check for state changes
            const changes = this.detectStateChanges(currentLoads);
            
            if (changes.length > 0) {
                this.log('info', `Detected ${changes.length} state changes`);
                this.stats.stateChanges += changes.length;
                this.stats.lastStateChange = new Date().toISOString();
                
                // Broadcast changes to WebSocket clients
                changes.forEach(change => {
                    this.broadcastStateChange(change);
                });
            } else {
                this.log('debug', 'No state changes detected');
            }
            
            // Reset retry count on successful poll
            this.retryCount = 0;
            
        } catch (error) {
            this.stats.errors++;
            
            // Check if this is an authentication error (401)
            const isAuthError = error.message.includes('401') || 
                               error.message.includes('Unauthorized') || 
                               error.message.includes('Access token is expired');
            
            if (isAuthError) {
                this.log('warn', `Authentication token expired, attempting to re-authenticate...`);
                
                try {
                    // Attempt to re-authenticate
                    await this.reauthenticate();
                    this.log('info', 'Re-authentication successful, continuing polling');
                    
                    // Reset retry count since we successfully re-authenticated
                    this.retryCount = 0;
                    return; // Don't increment retry count or wait
                    
                } catch (authError) {
                    this.log('error', `Re-authentication failed: ${authError.message}`);
                    // Fall through to normal retry logic
                }
            }
            
            this.retryCount++;
            this.log('error', `PDU poll failed (attempt ${this.retryCount}/${this.maxRetries}): ${error.message}`);
            
            if (this.retryCount >= this.maxRetries) {
                this.log('error', 'Maximum retry attempts reached, stopping poller');
                await this.stop();
                
                // Notify WebSocket clients of PDU connection issue
                this.wsServer.subscriptionManager.broadcastToAll({
                    type: 'pduStatus',
                    status: 'disconnected',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            } else {
                // Wait before next retry
                this.log('info', `Waiting ${this.retryDelay}ms before retry...`);
                await this.wait(this.retryDelay);
            }
        }
    }

    /**
     * Re-authenticate with PDU after token expiration
     */
    async reauthenticate() {
        this.log('info', 'Attempting PDU re-authentication...');
        
        try {
            // Logout current session (if possible)
            if (this.pdu) {
                try {
                    await this.pdu.logout();
                } catch (logoutError) {
                    // Ignore logout errors, token might already be invalid
                    this.log('debug', `Logout during re-auth failed (expected): ${logoutError.message}`);
                }
            }
            
            // Create new PDU instance with fresh authentication
            this.pdu = new TripplitePDU();
            
            // Test the new connection
            const testLoads = await this.pdu.getAllLoads();
            this.log('info', `Re-authentication successful! PDU accessible with ${testLoads.length} loads`);
            
            // Notify WebSocket clients that PDU is back online
            this.wsServer.subscriptionManager.broadcastToAll({
                type: 'pduStatus',
                status: 'connected',
                message: 'PDU re-authentication successful',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            this.log('error', `Re-authentication failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Detect state changes between current and last known states
     * @param {Array} currentLoads - Current load states from PDU
     * @returns {Array} Array of state changes
     */
    detectStateChanges(currentLoads) {
        const changes = [];
        
        currentLoads.forEach(currentLoad => {
            const lastKnown = this.lastKnownStates.get(currentLoad.id);
            
            if (!lastKnown || lastKnown.state !== currentLoad.state) {
                const change = {
                    loadId: currentLoad.id,
                    name: currentLoad.name,
                    description: currentLoad.description,
                    previousState: lastKnown ? lastKnown.state : 'UNKNOWN',
                    currentState: currentLoad.state,
                    timestamp: new Date().toISOString()
                };
                
                changes.push(change);
                
                // Update last known state
                this.lastKnownStates.set(currentLoad.id, {
                    id: currentLoad.id,
                    name: currentLoad.name,
                    description: currentLoad.description,
                    state: currentLoad.state,
                    lastUpdated: change.timestamp
                });
                
                this.log('info', `State change: Load ${currentLoad.id} (${currentLoad.name}) ${lastKnown ? lastKnown.state : 'UNKNOWN'} → ${currentLoad.state}`);
            }
        });
        
        return changes;
    }

    /**
     * Broadcast state change to WebSocket clients
     * @param {Object} change - State change object
     */
    broadcastStateChange(change) {
        this.wsServer.broadcastStateChange(change.loadId, change);
    }

    /**
     * Perform action on PDU load
     * @param {string} loadId - Load ID or name
     * @param {string} action - Action to perform (on, off, cycle)
     * @param {boolean} byName - Whether loadId is actually a name
     * @returns {Promise<Object>} Action result
     */
    async performLoadAction(loadId, action, byName = false) {
        if (!this.pdu) {
            throw new Error('PDU not connected');
        }

        try {
            this.log('info', `Performing action "${action}" on load ${loadId} (byName: ${byName})`);
            
            let result;
            if (byName) {
                result = await this.pdu.performLoadActionByName(loadId, action);
            } else {
                result = await this.pdu.performLoadActionById(loadId, action);
            }
            
            this.log('info', `Action "${action}" completed on load ${loadId}`);
            
            // Force a poll shortly after action to detect the change quickly
            setTimeout(() => {
                if (this.isPolling) {
                    this.pollPDU().catch(error => {
                        this.log('error', `Post-action poll error: ${error.message}`);
                    });
                }
            }, 1000); // Poll 1 second after action
            
            return result;
            
        } catch (error) {
            this.log('error', `Action "${action}" failed on load ${loadId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get current state of specific load
     * @param {string} loadId - Load ID
     * @returns {Object|null} Current load state or null if not found
     */
    getCurrentLoadState(loadId) {
        return this.lastKnownStates.get(loadId) || null;
    }

    /**
     * Get all current load states
     * @returns {Array} Array of all current load states
     */
    getAllCurrentStates() {
        return Array.from(this.lastKnownStates.values());
    }

    /**
     * Get poller statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            isPolling: this.isPolling,
            pollIntervalMs: this.pollIntervalMs,
            retryCount: this.retryCount,
            maxRetries: this.maxRetries,
            totalLoads: this.lastKnownStates.size,
            uptime: this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0
        };
    }

    /**
     * Wait for specified time
     * @param {number} ms - Milliseconds to wait
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Logging helper
     * @param {string} level - Log level
     * @param {string} message - Log message
     */
    log(level, message) {
        if (config.enableDebug || level !== 'debug') {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [PDU-${level.toUpperCase()}] ${message}`);
        }
    }
}

module.exports = PDUPoller; 