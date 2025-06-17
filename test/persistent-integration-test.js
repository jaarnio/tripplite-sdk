// Persistent integration test for Tripplite PDU SDK
// Runs indefinitely until failure or manual stop to observe token refresh behavior
// Press Ctrl+C to stop gracefully

require('dotenv').config();
const TripplitePDUServer = require('../src/index');
const TripplitePDUClient = require('../src/client');

class PersistentIntegrationTest {
    constructor() {
        this.server = null;
        this.client = null;
        this.testResults = {
            startTime: new Date(),
            testsPassed: 0,
            testsFailed: 0,
            authTokenRefreshes: 0,
            stateChangesDetected: 0,
            artificialStateChanges: 0,
            errors: [],
            connectionIssues: [],
            authenticationIssues: []
        };
        
        this.intervals = {
            monitoring: null,
            stateChange: null,
            tokenCountdown: null
        };
        
        // Configuration for persistent testing
        this.stateChangeIntervalMs = 2 * 60 * 1000; // Every 2 minutes
        this.monitoringIntervalMs = 30 * 1000; // Every 30 seconds
        this.tokenCountdownIntervalMs = 60 * 1000; // Every 1 minute
        
        this.pduConfig = {
            host: process.env.PDU_HOST || '192.168.31.164',
            port: parseInt(process.env.PDU_PORT) || 443,
            username: process.env.PDU_USERNAME || 'power-dev',
            password: process.env.PDU_PASSWORD || 'password',
            deviceId: parseInt(process.env.PDU_DEVICE_ID) || 1,
            wsPort: parseInt(process.env.WS_PORT) || 8081,
            pollInterval: 10000, // 10 seconds - frequent enough to catch issues
            enableDebug: false // Reduce noise for long-running test
        };
        
        this.testLoadIds = ['1', '2', '3', '4'];
        this.currentTestLoadIndex = 0;
        this.isRunning = false;
        this.authInstance = null;
    }

    async run() {
        console.log('\n==================================================');
        console.log('TRIPPLITE PDU SDK - PERSISTENT INTEGRATION TEST');
        console.log('==================================================');
        console.log(`PDU Host: ${this.pduConfig.host}:${this.pduConfig.port}`);
        console.log(`Username: ${this.pduConfig.username}`);
        console.log(`WebSocket Port: ${this.pduConfig.wsPort}`);
        console.log(`Poll Interval: ${this.pduConfig.pollInterval}ms`);
        console.log(`State Change Tests: Every ${this.stateChangeIntervalMs / 1000}s`);
        console.log(`Health Monitoring: Every ${this.monitoringIntervalMs / 1000}s`);
        console.log('\n🎯 GOAL: Run until token expiry/refresh or failure');
        console.log('📋 Press Ctrl+C to stop gracefully');
        console.log('==================================================\n');

        // Setup graceful shutdown
        this._setupGracefulShutdown();

        try {
            this.isRunning = true;
            
            await this._initializeServer();
            await this._connectClient();
            this._startAllMonitoring();
            
            // Run indefinitely
            await this._runIndefinitely();
            
        } catch (error) {
            console.error(`\n❌ CRITICAL TEST FAILURE: ${error.message}`);
            this.testResults.errors.push({
                timestamp: new Date(),
                type: 'CRITICAL',
                message: error.message,
                stack: error.stack
            });
        } finally {
            await this._cleanup();
        }
    }

    async _initializeServer() {
        console.log('📡 Initializing PDU Server...');
        
        this.server = new TripplitePDUServer(this.pduConfig);
        
        // Get auth instance for token monitoring
        this.authInstance = require('../src/lib/auth');
        
        // Monitor server events with enhanced auth tracking
        const originalLog = this.server.log.bind(this.server);
        this.server.log = (level, message) => {
            // Only show important messages to reduce noise
            if (level !== 'debug' || message.includes('auth') || message.includes('token')) {
                originalLog(level, message);
            }
            
            // Track authentication-related events
            if (message.includes('token') || message.includes('auth') || message.includes('401')) {
                const timestamp = new Date().toISOString();
                console.log(`🔐 [${timestamp}] AUTH EVENT [${level}]: ${message}`);
                
                if (message.includes('refresh') || message.includes('Re-authentication successful')) {
                    this.testResults.authTokenRefreshes++;
                    console.log(`\n🎉 TOKEN REFRESH #${this.testResults.authTokenRefreshes} DETECTED!`);
                    this._showTokenInfo();
                }
                
                if (level === 'error' && (message.includes('401') || message.includes('auth'))) {
                    this.testResults.authenticationIssues.push({
                        timestamp: new Date(),
                        level,
                        message
                    });
                }
            }
            
            if (level === 'error') {
                this.testResults.connectionIssues.push({
                    timestamp: new Date(),
                    message
                });
            }
        };
        
        await this.server.start();
        console.log('✅ PDU Server started successfully');
        
        // Show initial token info
        this._showTokenInfo();
        this.testResults.testsPassed++;
    }

    async _connectClient() {
        console.log('🔌 Connecting client...');
        
        this.client = new TripplitePDUClient({
            url: `ws://localhost:${this.pduConfig.wsPort}`,
            onConnect: () => {
                console.log('✅ Client connected to WebSocket server');
                this.testResults.testsPassed++;
            },
            onDisconnect: () => {
                console.log('⚠️  Client disconnected from WebSocket server');
                this.testResults.connectionIssues.push({
                    timestamp: new Date(),
                    message: 'Client disconnected'
                });
            },
            onError: (error) => {
                console.log(`❌ Client error: ${error.message}`);
                this.testResults.errors.push({
                    timestamp: new Date(),
                    type: 'CLIENT_ERROR',
                    message: error.message
                });
            },
            onStateChange: (change) => {
                console.log(`🔄 State change detected: Load ${change.loadId} -> ${change.currentState}`);
                this.testResults.stateChangesDetected++;
            }
        });
        
        await this.client.connect();
        this.client.subscribe(this.testLoadIds);
        console.log(`✅ Client connected and subscribed to loads: ${this.testLoadIds.join(', ')}`);
        this.testResults.testsPassed++;
    }

    _startAllMonitoring() {
        console.log('👀 Starting monitoring systems...\n');
        
        // Health monitoring
        this.intervals.monitoring = setInterval(async () => {
            await this._performHealthCheck();
        }, this.monitoringIntervalMs);
        
        // State change tests
        this.intervals.stateChange = setInterval(async () => {
            await this._performStateChangeTest();
        }, this.stateChangeIntervalMs);
        
        // Token countdown
        this.intervals.tokenCountdown = setInterval(() => {
            this._showTokenCountdown();
        }, this.tokenCountdownIntervalMs);
    }

    async _performHealthCheck() {
        if (!this.isRunning) return;
        
        try {
            const serverStats = this.server.getStats();
            const elapsed = Math.floor((Date.now() - this.testResults.startTime.getTime()) / 1000);
            const elapsedHours = Math.floor(elapsed / 3600);
            const elapsedMins = Math.floor((elapsed % 3600) / 60);
            const elapsedSecs = elapsed % 60;
            
            console.log(`\n📊 HEALTH CHECK (${elapsedHours}h ${elapsedMins}m ${elapsedSecs}s elapsed):`);
            console.log(`   Server: Running=${serverStats.isRunning}, Polls=${serverStats.pollCount}`);
            console.log(`   Clients: ${serverStats.connectedClients}, State Changes: ${serverStats.stateChanges}`);
            console.log(`   Errors: ${serverStats.errors}, Auth Refreshes: ${this.testResults.authTokenRefreshes}`);
            
            // Test server responsiveness
            const loads = await this.server.getAllLoads();
            if (loads && loads.length > 0) {
                console.log(`   ✅ API responsive (${loads.length} loads)`);
                this.testResults.testsPassed++;
            } else {
                console.log(`   ❌ API returned no loads`);
                this.testResults.testsFailed++;
            }
            
            // Show authentication status
            const hasValidToken = this.authInstance.isTokenValid();
            const needsRefresh = this.authInstance.needsRefresh();
            console.log(`   Auth: Valid=${hasValidToken}, NeedsRefresh=${needsRefresh}`);
            
        } catch (error) {
            console.log(`❌ Health check failed: ${error.message}`);
            this.testResults.errors.push({
                timestamp: new Date(),
                type: 'HEALTH_CHECK',
                message: error.message
            });
            this.testResults.testsFailed++;
        }
    }

    async _performStateChangeTest() {
        if (!this.isRunning) return;
        
        try {
            const loadId = this.testLoadIds[this.currentTestLoadIndex];
            this.currentTestLoadIndex = (this.currentTestLoadIndex + 1) % this.testLoadIds.length;
            
            console.log(`\n🔧 TESTING STATE CHANGE: Load ${loadId}`);
            
            const currentLoad = await this.server.getLoadById(loadId);
            const currentState = currentLoad.state;
            const newAction = currentState === 1 ? 'off' : 'on';
            
            console.log(`   Current: ${currentState}, Action: ${newAction}`);
            
            const result = await this.server.performLoadAction(loadId, newAction);
            
            if (result && result.data) {
                console.log(`   ✅ Action completed successfully`);
                this.testResults.artificialStateChanges++;
                this.testResults.testsPassed++;
            } else {
                console.log(`   ❌ Action failed`);
                this.testResults.testsFailed++;
            }
            
        } catch (error) {
            console.log(`❌ State change test failed: ${error.message}`);
            this.testResults.errors.push({
                timestamp: new Date(),
                type: 'STATE_CHANGE_TEST',
                message: error.message
            });
            this.testResults.testsFailed++;
        }
    }

    _showTokenInfo() {
        if (!this.authInstance.tokenExpiry) {
            console.log('🔐 Token info: No token expiry available');
            return;
        }
        
        const expiryDate = new Date(this.authInstance.tokenExpiry);
        const now = new Date();
        const timeToExpiry = this.authInstance.tokenExpiry - now.getTime();
        const minutesToExpiry = Math.floor(timeToExpiry / 1000 / 60);
        
        console.log(`🔐 Token expires: ${expiryDate.toISOString()}`);
        console.log(`⏰ Time to expiry: ${minutesToExpiry} minutes`);
        
        if (minutesToExpiry < 10) {
            console.log(`🚨 TOKEN EXPIRING SOON! ${minutesToExpiry} minutes remaining`);
        }
    }

    _showTokenCountdown() {
        if (!this.isRunning || !this.authInstance.tokenExpiry) return;
        
        const now = new Date();
        const timeToExpiry = this.authInstance.tokenExpiry - now.getTime();
        const minutesToExpiry = Math.floor(timeToExpiry / 1000 / 60);
        
        if (minutesToExpiry <= 60) { // Show countdown when less than 1 hour
            console.log(`⏰ Token expires in ${minutesToExpiry} minutes`);
        }
        
        if (minutesToExpiry < 5) {
            console.log(`🚨 TOKEN EXPIRING VERY SOON! ${minutesToExpiry} minutes!`);
        }
        
        if (minutesToExpiry < 0) {
            console.log(`🔴 TOKEN SHOULD BE EXPIRED! ${Math.abs(minutesToExpiry)} minutes overdue`);
        }
    }

    async _runIndefinitely() {
        console.log('🔄 Running indefinitely... (Press Ctrl+C to stop)\n');
        
        // Keep the process alive
        return new Promise((resolve) => {
            // This will only resolve when isRunning becomes false (via Ctrl+C)
            const checkInterval = setInterval(() => {
                if (!this.isRunning) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 1000);
        });
    }

    _setupGracefulShutdown() {
        const gracefulShutdown = async (signal) => {
            console.log(`\n⏹️  Received ${signal}. Shutting down gracefully...`);
            this.isRunning = false;
            
            this._generateFinalReport();
            await this._cleanup();
            process.exit(0);
        };
        
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    }

    _generateFinalReport() {
        const endTime = new Date();
        const totalDuration = endTime.getTime() - this.testResults.startTime.getTime();
        const hours = Math.floor(totalDuration / 1000 / 3600);
        const minutes = Math.floor((totalDuration % (1000 * 3600)) / 1000 / 60);
        
        console.log('\n==================================================');
        console.log('📋 FINAL TEST REPORT');
        console.log('==================================================');
        console.log(`Start: ${this.testResults.startTime.toISOString()}`);
        console.log(`End: ${endTime.toISOString()}`);
        console.log(`Duration: ${hours}h ${minutes}m`);
        console.log('');
        console.log(`✅ Tests Passed: ${this.testResults.testsPassed}`);
        console.log(`❌ Tests Failed: ${this.testResults.testsFailed}`);
        console.log(`🔐 Auth Token Refreshes: ${this.testResults.authTokenRefreshes}`);
        console.log(`🔄 State Changes Detected: ${this.testResults.stateChangesDetected}`);
        console.log(`🎯 Artificial State Changes: ${this.testResults.artificialStateChanges}`);
        
        if (this.testResults.authTokenRefreshes > 0) {
            console.log('\n🎉 SUCCESS: Token refresh functionality working!');
        } else {
            console.log('\n⚠️  No token refreshes observed (test may not have run long enough)');
        }
        
        console.log('==================================================\n');
    }

    async _cleanup() {
        console.log('🧹 Cleaning up...');
        
        // Clear all intervals
        Object.values(this.intervals).forEach(interval => {
            if (interval) clearInterval(interval);
        });
        
        // Disconnect client
        if (this.client) {
            try {
                this.client.disconnect();
                console.log('✅ Client disconnected');
            } catch (error) {
                console.log(`⚠️  Client cleanup error: ${error.message}`);
            }
        }
        
        // Stop server
        if (this.server) {
            try {
                await this.server.stop();
                console.log('✅ Server stopped');
            } catch (error) {
                console.log(`⚠️  Server cleanup error: ${error.message}`);
            }
        }
        
        console.log('✅ Cleanup completed');
    }
}

// Run if executed directly
if (require.main === module) {
    const test = new PersistentIntegrationTest();
    test.run().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = PersistentIntegrationTest; 