const axios = require('axios');
const auth = require('./auth');
const errorHandler = require('./error-handler');
const config = require('./config');

class LoadService {
    constructor() {
        this.httpsAgent = new (require('https').Agent)({
            rejectUnauthorized: false
        });
    }

    /**
     * Make an authenticated API request with automatic token refresh
     * @param {Object} requestConfig Axios request configuration
     * @returns {Promise<Object>} API response
     */
    async _makeAuthenticatedRequest(requestConfig) {
        // Ensure we have a valid token before making the request
        await this._ensureValidToken();

        // Add authentication header
        requestConfig.headers = requestConfig.headers || {};
        requestConfig.headers['Authorization'] = `Bearer ${auth.getAccessToken()}`;
        requestConfig.httpsAgent = this.httpsAgent;

        try {
            const response = await axios(requestConfig);
            return response;
        } catch (error) {
            // If we get a 401, the token might have expired between our check and the request
            if (error.response && error.response.status === 401) {
                console.log('Token expired during request, attempting refresh and retry...');
                
                try {
                    // Try to refresh the token
                    if (auth.needsRefresh()) {
                        await auth.refreshAccessToken();
                    } else {
                        // If no refresh token, do a full re-login
                        await auth.login();
                    }
                    
                    // Retry the request with the new token
                    requestConfig.headers['Authorization'] = `Bearer ${auth.getAccessToken()}`;
                    return await axios(requestConfig);
                } catch (refreshError) {
                    // If refresh fails, throw the original 401 error
                    throw error;
                }
            }
            
            // For non-401 errors, throw as-is
            throw error;
        }
    }

    /**
     * Ensure we have a valid token, refreshing if necessary
     */
    async _ensureValidToken() {
        if (!auth.getAccessToken()) {
            await auth.login();
            return;
        }
        
        if (auth.needsRefresh()) {
            await auth.refreshAccessToken();
            return;
        }
    }

    async getAllLoads() {
        try {
            const baseUrl = config.getBaseUrl();
            const response = await this._makeAuthenticatedRequest({
                method: 'GET',
                url: `${baseUrl}/loads`,
                headers: {
                    'Content-Type': 'application/vnd.api+json',
                    'Accept-Version': '1.0.0'
                }
            });

            // Extract and format the required fields
            if (response.data && response.data.data) {
                return response.data.data.map(load => ({
                    id: load.id,
                    name: load.attributes.name,
                    description: load.attributes.description,
                    state: load.attributes.state
                }));
            }
            return [];
        } catch (error) {
            return errorHandler.handleApiError(error, 'Get all loads');
        }
    }

    async getLoadIdByName(name) {
        try {
            const loadData = await this.getLoadByName(name);
            if (!loadData || !loadData.data || !loadData.data.id) {
                throw new Error(`Load with name ${name} not found`);
            }
            return loadData.data.id;
        } catch (error) {
            if (error.originalError) {
                // Already handled by errorHandler
                throw error;
            }
            return errorHandler.handleApiError(error, `Get load ID by name: ${name}`);
        }
    }

    async updateLoad(loadId, name, description) {
        try {
            const baseUrl = config.getBaseUrl();
            const response = await this._makeAuthenticatedRequest({
                method: 'PATCH',
                url: `${baseUrl}/loads/${loadId}`,
                data: {
                    data: {
                        type: "loads",
                        id: loadId.toString(),
                        attributes: {
                            name,
                            description
                        }
                    }
                },
                headers: {
                    'Content-Type': 'application/vnd.api+json',
                    'Accept-Version': '1.0.0'
                }
            });
            return response.data;
        } catch (error) {
            return errorHandler.handleApiError(error, `Update load: ${loadId}`);
        }
    }

    async performLoadAction(loadIdentifier, action, useNameLookup = false) {
        const actionMap = {
            'on': 'LOAD_ACTION_ON',
            'off': 'LOAD_ACTION_OFF',
            'cycle': 'LOAD_ACTION_CYCLE'
        };

        if (!actionMap[action]) {
            throw new Error('Invalid action. Must be one of: on, off, cycle');
        }

        try {
            let loadId = loadIdentifier;
            if (useNameLookup) {
                loadId = await this.getLoadIdByName(loadIdentifier);
            }

            const baseUrl = config.getBaseUrl();
            const deviceId = config.deviceId || 1;
            
            const response = await this._makeAuthenticatedRequest({
                method: 'PATCH',
                url: `${baseUrl}/loads_execute/${loadId}`,
                data: {
                    data: {
                        type: "loads_execute",
                        attributes: {
                            device_id: deviceId,
                            load_action: actionMap[action]
                        }
                    }
                },
                headers: {
                    'Content-Type': 'application/vnd.api+json',
                    'Accept-Version': '1.0.0'
                }
            });
            return response.data;
        } catch (error) {
            return errorHandler.handleApiError(error, `Load action ${action}`);
        }
    }

    async getLoadByName(name) {
        try {
            const baseUrl = config.getBaseUrl();
            const deviceId = config.deviceId || 1;
            
            const response = await this._makeAuthenticatedRequest({
                method: 'GET',
                url: `${baseUrl}/loads/${name}`,
                headers: {
                    'Content-Type': 'application/vnd.api+json',
                    'Accept-Version': '1.0.0',
                    'By': 'name',
                    'deviceId': deviceId.toString()
                }
            });
            return response.data;
        } catch (error) {
            return errorHandler.handleApiError(error, `Get load by name: ${name}`);
        }
    }
    
    async getLoadById(id) {
        try {
            const baseUrl = config.getBaseUrl(); 
            const response = await this._makeAuthenticatedRequest({
                method: 'GET',
                url: `${baseUrl}/loads/${id}`,
                headers: {
                    'Content-Type': 'application/vnd.api+json',
                    'Accept-Version': '1.0.0'
                }
            });
            return response.data;
        } catch (error) {
            return errorHandler.handleApiError(error, `Get load by ID: ${id}`);
        }
    }
}

// Create a singleton instance
const loadServiceInstance = new LoadService();

// Export both the class and the singleton instance
// This allows for both ES module and CommonJS compatibility
module.exports = loadServiceInstance;
module.exports.default = loadServiceInstance; 