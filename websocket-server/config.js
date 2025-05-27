// WebSocket Server Configuration
// Load environment variables if available
try {
    require('dotenv').config();
} catch (error) {
    // dotenv is optional, continue without it if not available
}

class WebSocketConfig {
    constructor() {
        // WebSocket Server Settings
        this.wsPort = parseInt(process.env.WS_PORT) || 8080;
        this.maxClients = parseInt(process.env.WS_MAX_CLIENTS) || 16;
        
        // PDU Polling Settings
        this.pollInterval = parseInt(process.env.PDU_POLL_INTERVAL) || 5000; // 5 seconds default
        this.maxRetries = parseInt(process.env.PDU_MAX_RETRIES) || 3;
        this.retryDelay = parseInt(process.env.PDU_RETRY_DELAY) || 1000; // 1 second
        
        // Heartbeat Settings
        this.heartbeatInterval = parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000; // 30 seconds
        this.clientTimeout = parseInt(process.env.WS_CLIENT_TIMEOUT) || 60000; // 1 minute
        
        // Logging
        this.logLevel = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error
        this.enableDebug = process.env.ENABLE_DEBUG === 'true';
    }

    /**
     * Get configuration summary for logging
     */
    getSummary() {
        return {
            websocket: {
                port: this.wsPort,
                maxClients: this.maxClients,
                heartbeatInterval: this.heartbeatInterval,
                clientTimeout: this.clientTimeout
            },
            pdu: {
                pollInterval: this.pollInterval,
                maxRetries: this.maxRetries,
                retryDelay: this.retryDelay
            },
            logging: {
                level: this.logLevel,
                debug: this.enableDebug
            }
        };
    }
}

const config = new WebSocketConfig();
module.exports = config; 