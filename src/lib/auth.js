const axios = require('axios');
const errorHandler = require('./error-handler');
const config = require('./config');

class AuthService {
    constructor() {
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        // Add a buffer time before token expiry (5 minutes)
        this.tokenExpiryBuffer = 5 * 60 * 1000;
    }

    async login(username, password) {
        try {
            // If we already have a valid token, don't create a new session
            if (this.isTokenValid()) {
                return { access_token: this.accessToken, refresh_token: this.refreshToken };
            }

            // Use config values
            const baseUrl = config.getBaseUrl();
            username = username || config.username;
            password = password || config.password;
            
            if (!username || !password) {
                throw new Error('Username and password are required for authentication');
            }

            // Match the exact format from the example
            const raw = JSON.stringify({
                username,
                password,
                grant_type: 'password'
            });

            const response = await axios.post(`${baseUrl}/oauth/token`, raw, {
                headers: {
                    'Content-Type': 'application/vnd.api+json',
                    'Accept-Version': '1.0.0'
                },
                httpsAgent: new (require('https').Agent)({
                    rejectUnauthorized: false
                })
            });

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;
            
            // Set token expiry (default to 1 hour if not specified in response)
            const expiresIn = response.data.expires_in || 3600;
            this.tokenExpiry = Date.now() + (expiresIn * 1000);
            
            return response.data;
        } catch (error) {
            // If we hit the session limit, try to refresh the token instead
            if (error.response && error.response.status === 429) {
                if (this.refreshToken) {
                    console.log('Session limit reached, attempting to refresh token...');
                    return this.refreshAccessToken();
                }
            }
            
            return errorHandler.handleApiError(error, 'Authentication');
        }
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const baseUrl = config.getBaseUrl();
            const response = await axios.post(`${baseUrl}/oauth/token/refresh`, '', {
                headers: {
                    'Authorization': `Bearer ${this.refreshToken}`,
                    'Content-Type': 'application/vnd.api+json',
                    'Accept-Version': '1.0.0'
                },
                httpsAgent: new (require('https').Agent)({
                    rejectUnauthorized: false
                })
            });

            this.accessToken = response.data.access_token;
            // Sometimes refresh token API also returns a new refresh token
            if (response.data.refresh_token) {
                this.refreshToken = response.data.refresh_token;
            }
            
            // Set token expiry (default to 1 hour if not specified in response)
            const expiresIn = response.data.expires_in || 3600;
            this.tokenExpiry = Date.now() + (expiresIn * 1000);
            
            return response.data;
        } catch (error) {
            // If refresh fails with 401, the refresh token may be invalid or expired
            // Clear tokens to force a new login
            if (error.response && error.response.status === 401) {
                this.accessToken = null;
                this.refreshToken = null;
                this.tokenExpiry = null;
            }
            
            return errorHandler.handleApiError(error, 'Token refresh');
        }
    }

    async logout() {
        if (!this.accessToken) {
            return; // Nothing to do if not logged in
        }
        
        try {
            // First, try the explicit token revocation endpoint if it exists
            const baseUrl = config.getBaseUrl();
            
            // Note: Some Tripplite PDU API versions may not support this endpoint
            // In that case we'll just clear our local tokens
            try {
                await axios.post(`${baseUrl}/oauth/token/revoke`, '', {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/vnd.api+json',
                        'Accept-Version': '1.0.0'
                    },
                    httpsAgent: new (require('https').Agent)({
                        rejectUnauthorized: false
                    })
                });
            } catch (error) {
                // If the endpoint doesn't exist (404) or fails for other reasons,
                // we'll still clear our local tokens below
            }
        } finally {
            // Always clear tokens
            this.accessToken = null;
            this.refreshToken = null;
            this.tokenExpiry = null;
        }
    }

    isTokenValid() {
        return this.accessToken && this.tokenExpiry && (Date.now() < (this.tokenExpiry - this.tokenExpiryBuffer));
    }

    getAccessToken() {
        return this.accessToken;
    }

    needsRefresh() {
        return this.accessToken && this.tokenExpiry && !this.isTokenValid() && this.refreshToken;
    }
}

// Create a singleton instance
const authInstance = new AuthService();

// Export both the class and the singleton instance
// This allows for both ES module and CommonJS compatibility
module.exports = authInstance;
module.exports.default = authInstance; 