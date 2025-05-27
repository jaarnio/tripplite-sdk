// Try to load environment variables if available
try {
    require('dotenv').config();
} catch (error) {
    // dotenv is optional, continue without it if not available
}

class Config {
    constructor() {
        this.host = null;
        this.port = 443;
        this.username = null;
        this.password = null;
        this.deviceId = 1;
        this.initialized = false;
    }

    /**
     * Configure the Tripplite PDU client
     * @param {Object} options Configuration options
     * @param {string} options.host The IP address or hostname of the PDU
     * @param {number} [options.port=443] The port number (default: 443)
     * @param {string} options.username Username for authentication
     * @param {string} options.password Password for authentication
     * @param {number} [options.deviceId=1] Device ID (default: 1)
     */
    configure(options = {}) {
        // Use provided options or fall back to environment variables
        this.host = options.host || process.env.TRIPPLITE_PDU_HOST;
        this.port = options.port || parseInt(process.env.TRIPPLITE_PDU_PORT) || 443;
        this.username = options.username || process.env.TRIPPLITE_PDU_USERNAME;
        this.password = options.password || process.env.TRIPPLITE_PDU_PASSWORD;
        this.deviceId = options.deviceId || parseInt(process.env.TRIPPLITE_PDU_DEVICE_ID) || 1;

        // Validate required fields
        if (!this.host) throw new Error('Host is required (provide via options.host or TRIPPLITE_PDU_HOST environment variable)');
        if (!this.username) throw new Error('Username is required (provide via options.username or TRIPPLITE_PDU_USERNAME environment variable)');
        if (!this.password) throw new Error('Password is required (provide via options.password or TRIPPLITE_PDU_PASSWORD environment variable)');

        this.initialized = true;
    }

    /**
     * Check if configuration is valid
     * @throws {Error} If required configuration is missing
     */
    validate() {
        if (!this.initialized) {
            throw new Error('Configuration not set. Call configure() first.');
        }
        if (!this.host) throw new Error('Host is required.');
        if (!this.username) throw new Error('Username is required.');
        if (!this.password) throw new Error('Password is required.');
    }

    /**
     * Get the base URL for API requests
     * @returns {string} The base URL
     */
    getBaseUrl() {
        this.validate();
        return `https://${this.host}:${this.port}/api`;
    }
}

const configInstance = new Config();

module.exports = configInstance;
module.exports.default = configInstance; 