// Configuration for Tripplite WebSocket Server
require('dotenv').config();

const config = {
    // WebSocket Server Configuration
    wsPort: parseInt(process.env.WS_PORT) || 8081,
    maxClients: parseInt(process.env.WS_MAX_CLIENTS) || 16,
    
    // PDU Poller Configuration
    pollInterval: parseInt(process.env.PDU_POLL_INTERVAL) || 5000, // 5 seconds
    maxRetries: parseInt(process.env.PDU_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.PDU_RETRY_DELAY) || 5000, // 5 seconds
    
    // Heartbeat Configuration
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000, // 30 seconds
    clientTimeout: parseInt(process.env.WS_CLIENT_TIMEOUT) || 60000, // 60 seconds
    
    // Debug and Logging
    enableDebug: process.env.WS_DEBUG === 'true' || false,
    
    // Helper method to get configuration summary
    getSummary() {
        return {
            wsPort: this.wsPort,
            maxClients: this.maxClients,
            pollInterval: this.pollInterval,
            maxRetries: this.maxRetries,
            retryDelay: this.retryDelay,
            heartbeatInterval: this.heartbeatInterval,
            clientTimeout: this.clientTimeout,
            enableDebug: this.enableDebug
        };
    }
};

module.exports = config; 