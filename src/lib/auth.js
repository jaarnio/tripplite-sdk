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
        
        // Prevent concurrent token refresh attempts
        this.refreshInProgress = false;
        this.refreshPromise = null;
    }

    async login(username, password) {
        try {
            // If we already have a valid token, don't create a new session
            if (this.isTokenValid()) {
                console.log('Using existing valid token');
                return { access_token: this.accessToken, refresh_token: this.refreshToken };
            }

            // Use config values
            const baseUrl = config.getBaseUrl();
            username = username || config.username;
            password = password || config.password;
            
            if (!username || !password) {
                throw new Error('Username and password are required for authentication');
            }

            console.log('Performing new authentication...');
            
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
            

            
            // Extract real expiry time from JWT token
            this.tokenExpiry = this._extractJWTExpiry(this.accessToken);
            
            const expiryDate = new Date(this.tokenExpiry);
            const expiresIn = Math.floor((this.tokenExpiry - Date.now()) / 1000);
            console.log(`Authentication successful. Token expires in ${expiresIn} seconds at: ${expiryDate.toISOString()}`);
            
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
            console.log('No refresh token available for refresh');
            throw new Error('No refresh token available');
        }

        // If refresh is already in progress, wait for it to complete
        if (this.refreshInProgress && this.refreshPromise) {
            console.log('Token refresh already in progress, waiting...');
            return await this.refreshPromise;
        }

        // Set refresh in progress and create promise
        this.refreshInProgress = true;
        this.refreshPromise = this._performTokenRefresh();

        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            // Reset refresh state
            this.refreshInProgress = false;
            this.refreshPromise = null;
        }
    }

    async _performTokenRefresh() {
        try {
            console.log('Refreshing access token...');
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
            
            // Extract real expiry time from JWT token
            this.tokenExpiry = this._extractJWTExpiry(this.accessToken);
            
            const expiryDate = new Date(this.tokenExpiry);
            const expiresIn = Math.floor((this.tokenExpiry - Date.now()) / 1000);
            console.log(`Token refresh successful. New token expires in ${expiresIn} seconds at: ${expiryDate.toISOString()}`);
            
            return response.data;
        } catch (error) {
            console.log(`Token refresh failed: ${error.response?.status} ${error.response?.statusText || error.message}`);
            
            // If refresh fails with 401, the refresh token may be invalid or expired
            // Clear tokens to force a new login
            if (error.response && error.response.status === 401) {
                console.log('Refresh token expired or invalid, clearing tokens');
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
        if (!this.accessToken || !this.tokenExpiry) {
            return false;
        }
        
        const now = Date.now();
        const expiryWithBuffer = this.tokenExpiry - this.tokenExpiryBuffer;
        return now < expiryWithBuffer;
    }

    getAccessToken() {
        return this.accessToken;
    }

    needsRefresh() {
        return this.accessToken && this.tokenExpiry && !this.isTokenValid() && this.refreshToken;
    }

    /**
     * Extract expiry time from JWT token
     * @param {string} token JWT token
     * @returns {number} Expiry timestamp in milliseconds
     */
    _extractJWTExpiry(token) {
        try {
            // JWT format: header.payload.signature
            const parts = token.split('.');
            if (parts.length !== 3) {
                console.log('Invalid JWT format, falling back to 1 hour default');
                return Date.now() + (3600 * 1000);
            }
            
            // Decode the payload (base64url)
            const payload = parts[1];
            // Add padding if needed for base64 decoding
            const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
            const decoded = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
            const claims = JSON.parse(decoded.toString());
            
            if (claims.exp) {
                // JWT exp is in seconds, convert to milliseconds
                const expiryMs = claims.exp * 1000;
                console.log(`JWT expiry extracted: ${new Date(expiryMs).toISOString()}`);
                return expiryMs;
            } else {
                console.log('No exp claim found in JWT, falling back to 1 hour default');
                return Date.now() + (3600 * 1000);
            }
        } catch (error) {
            console.log(`Failed to parse JWT token: ${error.message}, falling back to 1 hour default`);
            return Date.now() + (3600 * 1000);
        }
    }
}

// Create a singleton instance
const authInstance = new AuthService();

// Export both the class and the singleton instance
// This allows for both ES module and CommonJS compatibility
module.exports = authInstance;
module.exports.default = authInstance; 