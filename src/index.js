// Load environment variables first, before loading any other modules
try {
    require('dotenv').config();
} catch (error) {
    // dotenv is optional, continue without it if not available
}

const auth = require('./lib/auth');
const loadService = require('./lib/load-service');
const config = require('./lib/config');

// Extract default exports if they exist, otherwise use the module directly
const authInstance = auth.default || auth;
const loadServiceInstance = loadService.default || loadService;
const configInstance = config.default || config;

class TripplitePDU {
    /**
     * Create a new TripplitePDU client
     * @param {Object} options Configuration options
     * @param {string} options.host The IP address or hostname of the PDU
     * @param {number} [options.port=443] The port number
     * @param {string} options.username Username for authentication
     * @param {string} options.password Password for authentication
     * @param {number} [options.deviceId=1] Device ID
     */
    constructor(options = {}) {
        configInstance.configure(options);
    }

    /**
     * Get all loads and their status
     * @returns {Promise<Array>} Array of load objects
     */
    async getAllLoads() {
        await this._ensureAuthenticated();
        return loadServiceInstance.getAllLoads();
    }

    /**
     * Get a load's status by ID
     * @param {string|number} id The load ID
     * @returns {Promise<Object>} Load status
     */
    async getLoadById(id) {
        await this._ensureAuthenticated();
        const result = await loadServiceInstance.getLoadById(id);
        return this._formatLoadResponse(result);
    }

    /**
     * Get a load's status by name
     * @param {string} name The load name
     * @returns {Promise<Object>} Load status
     */
    async getLoadByName(name) {
        await this._ensureAuthenticated();
        const result = await loadServiceInstance.getLoadByName(name);
        return this._formatLoadResponse(result);
    }

    /**
     * Update a load's name and description
     * @param {string|number} id The load ID
     * @param {string} name New name
     * @param {string} description New description
     * @returns {Promise<Object>} Updated load status
     */
    async updateLoad(id, name, description) {
        await this._ensureAuthenticated();
        const result = await loadServiceInstance.updateLoad(id, name, description);
        return this._formatLoadResponse(result);
    }

    /**
     * Perform an action on a load by ID
     * @param {string|number} id The load ID
     * @param {'on'|'off'|'cycle'} action The action to perform
     * @returns {Promise<Object>} Action response
     */
    async performLoadActionById(id, action) {
        await this._ensureAuthenticated();
        const actionResponse = await loadServiceInstance.performLoadAction(id, action, false);
        return actionResponse;
    }

    /**
     * Perform an action on a load by name
     * @param {string} name The load name
     * @param {'on'|'off'|'cycle'} action The action to perform
     * @returns {Promise<Object>} Action response
     */
    async performLoadActionByName(name, action) {
        await this._ensureAuthenticated();
        const actionResponse = await loadServiceInstance.performLoadAction(name, action, true);
        return actionResponse;
    }

    /**
     * Explicitly logout and revoke the token to free up a session slot
     * Call this method when you're done using the PDU to prevent session limit errors
     * @returns {Promise<void>}
     */
    async logout() {
        await authInstance.logout();
    }

    async _ensureAuthenticated() {
        // If no token exists, perform a fresh login
        if (!authInstance.getAccessToken()) {
            await authInstance.login();
            return;
        }
        
        // If token exists but needs refresh, refresh it
        if (authInstance.needsRefresh()) {
            await authInstance.refreshAccessToken();
            return;
        }
        
        // Otherwise, token is valid and doesn't need refresh
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
}

// Export the class as both default export and named export
// This ensures compatibility with both ESM and CommonJS
module.exports = TripplitePDU;
module.exports.default = TripplitePDU; 