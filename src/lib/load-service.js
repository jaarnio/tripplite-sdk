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

    async getAllLoads() {
        try {
            const baseUrl = config.getBaseUrl();
            const response = await axios.get(`${baseUrl}/loads`, {
                headers: {
                    'Authorization': `Bearer ${auth.getAccessToken()}`,
                    'Content-Type': 'application/vnd.api+json',
                    'Accept-Version': '1.0.0'
                },
                httpsAgent: this.httpsAgent
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
            const response = await axios.patch(`${baseUrl}/loads/${loadId}`, {
                data: {
                    type: "loads",
                    id: loadId.toString(),
                    attributes: {
                        name,
                        description
                    }
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${auth.getAccessToken()}`,
                    'Content-Type': 'application/vnd.api+json',
                    'Accept-Version': '1.0.0'
                },
                httpsAgent: this.httpsAgent
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
            
            const response = await axios.patch(`${baseUrl}/loads_execute/${loadId}`, {
                data: {
                    type: "loads_execute",
                    attributes: {
                        device_id: deviceId,
                        load_action: actionMap[action]
                    }
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${auth.getAccessToken()}`,
                    'Content-Type': 'application/vnd.api+json',
                    'Accept-Version': '1.0.0'
                },
                httpsAgent: this.httpsAgent
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
            
            const response = await axios.get(`${baseUrl}/loads/${name}`, {
                headers: {
                    'Authorization': `Bearer ${auth.getAccessToken()}`,
                    'Content-Type': 'application/vnd.api+json',
                    'Accept-Version': '1.0.0',
                    'By': 'name',
                    'deviceId': deviceId.toString()
                },
                httpsAgent: this.httpsAgent
            });
            return response.data;
        } catch (error) {
            return errorHandler.handleApiError(error, `Get load by name: ${name}`);
        }
    }
    
    async getLoadById(id) {
        try {
            const baseUrl = config.getBaseUrl(); 
            const response = await axios.get(`${baseUrl}/loads/${id}`, {
                headers: {
                    'Authorization': `Bearer ${auth.getAccessToken()}`,
                    'Content-Type': 'application/vnd.api+json',
                    'Accept-Version': '1.0.0'
                },
                httpsAgent: this.httpsAgent
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