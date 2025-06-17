// Long-running integration test for Tripplite PDU SDK
// Tests authentication token handling, connection stability, and real-world usage patterns
// This test should run for 10-15 minutes to validate token expiration handling

require('dotenv').config();
const TripplitePDUServer = require('../src/index');
const TripplitePDUClient = require('../src/client');

class LongRunningIntegrationTest {
    constructor() {
        this.server = null;
        this.client = null;
        this.testResults = {
            startTime: new Date(),
            endTime: null,
            totalDuration: 0,
            testsPassed: 0,
            testsFailed: 0,
            authTokenRefreshes: 0,
            stateChangesDetected: 0,
            artificialStateChanges: 0,
            errors: [],
            connectionIssues: [],
            authenticationIssues: []
        };
        
        this.testInterval = null;
        this.stateChangeInterval = null;
        this.monitoringInterval = null;
        
        // Test configuration
        this.testDurationMs = 15 * 60 * 1000; // 15 minutes
        this.stateChangeIntervalMs = 90 * 1000; // Trigger state change every 90 seconds
        this.monitoringIntervalMs = 30 * 1000; // Check health every 30 seconds
        
        // PDU configuration from environment
        this.pduConfig = {
            host: process.env.PDU_HOST || '192.168.31.164',
            port: parseInt(process.env.PDU_PORT) || 443,
            username: process.env.PDU_USERNAME || 'power-dev',
            password: process.env.PDU_PASSWORD || 'password',
            deviceId: parseInt(process.env.PDU_DEVICE_ID) || 1,
            wsPort: parseInt(process.env.WS_PORT) || 8081,
            pollInterval: 10000, // More frequent polling to test token refresh
            enableDebug: true
        };
        
        // Test load IDs to cycle (use first 4 loads)
        this.testLoadIds = ['1', '2', '3', '4'];
        this.currentTestLoadIndex = 0;
        
        this.isRunning = false;
    }

    async run() {
        console.log('\n==================================================');
        console.log('TRIPPLITE PDU SDK - LONG RUNNING INTEGRATION TEST');
        console.log('==================================================');
        console.log(`Duration: ${this.testDurationMs / 1000 / 60} minutes`);
        console.log(`PDU Host: ${this.pduConfig.host}:${this.pduConfig.port}`);
        console.log(`Username: ${this.pduConfig.username}`);
        console.log(`WebSocket Port: ${this.pduConfig.wsPort}`);
        console.log(`Poll Interval: ${this.pduConfig.pollInterval}ms`);
        console.log(`State Change Tests: Every ${this.stateChangeIntervalMs / 1000}s`);
        console.log('==================================================\n');

        try {
            this.isRunning = true;
            
            // Step 1: Initialize and start server
            await this._initializeServer();
            
            // Step 2: Connect client
            await this._connectClient();
            
            // Step 3: Start monitoring and testing routines
            this._startMonitoring();
            this._startStateChangeTests();
            
            // Step 4: Run for specified duration
            await this._runForDuration();
            
            // Step 5: Generate final report
            this._generateFinalReport();
            
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
        
        // Monitor server events
        const originalLog = this.server.log.bind(this.server);
        this.server.log = (level, message) => {
            originalLog(level, message);
            
            // Track authentication-related events
            if (message.includes('token') || message.includes('auth') || message.includes('401')) {
                console.log(`🔐 AUTH EVENT [${level}]: ${message}`);
                if (message.includes('refresh') || message.includes('Re-authentication successful')) {
                    this.testResults.authTokenRefreshes++;
                }
                if (level === 'error' && (message.includes('401') || message.includes('auth'))) {
                    this.testResults.authenticationIssues.push({
                        timestamp: new Date(),
                        level,
                        message
                    });
                }
            }
            
            // Track connection issues
            if (level === 'error' && (message.includes('connection') || message.includes('network'))) {
                this.testResults.connectionIssues.push({
                    timestamp: new Date(),
                    message
                });
            }
        };
        
        await this.server.start();
        console.log('✅ PDU Server started successfully');
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
        
        // Subscribe to all test loads at once
        this.client.subscribe(this.testLoadIds);
        console.log(`📥 Subscribed to loads: ${this.testLoadIds.join(', ')}`);
        
        // Wait a moment for subscription to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('✅ Client connected and subscribed');
        this.testResults.testsPassed++;
    }

    _startMonitoring() {
        console.log('👀 Starting health monitoring...');
        
        this.monitoringInterval = setInterval(async () => {
            try {
                if (!this.isRunning) return;
                
                const serverStats = this.server.getStats();
                const elapsed = Math.floor((Date.now() - this.testResults.startTime.getTime()) / 1000);
                
                console.log(`\n📊 HEALTH CHECK (${Math.floor(elapsed / 60)}m ${elapsed % 60}s elapsed):`);
                console.log(`   Server running: ${serverStats.isRunning}`);
                console.log(`   Connected clients: ${serverStats.connectedClients}`);
                console.log(`   Poll count: ${serverStats.pollCount}`);
                console.log(`   State changes: ${serverStats.stateChanges}`);
                console.log(`   Errors: ${serverStats.errors}`);
                console.log(`   Auth refreshes: ${this.testResults.authTokenRefreshes}`);
                
                // Test server responsiveness
                const loads = await this.server.getAllLoads();
                if (loads && loads.length > 0) {
                    console.log(`   ✅ Server responsive (${loads.length} loads)`);
                    this.testResults.testsPassed++;
                } else {
                    console.log(`   ⚠️  Server returned no loads`);
                    this.testResults.testsFailed++;
                }
                
                // Test authentication status
                const authInstance = require('../src/lib/auth');
                const hasValidToken = authInstance.isTokenValid();
                const needsRefresh = authInstance.needsRefresh();
                console.log(`   Auth status: Valid=${hasValidToken}, NeedsRefresh=${needsRefresh}`);
                
            } catch (error) {
                console.log(`❌ Health check failed: ${error.message}`);
                this.testResults.errors.push({
                    timestamp: new Date(),
                    type: 'HEALTH_CHECK',
                    message: error.message
                });
                this.testResults.testsFailed++;
            }
        }, this.monitoringIntervalMs);
    }

    _startStateChangeTests() {
        console.log('🎯 Starting periodic state change tests...');
        
        this.stateChangeInterval = setInterval(async () => {
            try {
                if (!this.isRunning) return;
                
                const loadId = this.testLoadIds[this.currentTestLoadIndex];
                this.currentTestLoadIndex = (this.currentTestLoadIndex + 1) % this.testLoadIds.length;
                
                console.log(`\n🔧 TRIGGERING TEST STATE CHANGE: Load ${loadId}`);
                
                // Get current state
                const currentLoad = await this.server.getLoadById(loadId);
                const currentState = currentLoad.state;
                const newAction = currentState === 1 ? 'off' : 'on';
                
                console.log(`   Current state: ${currentState}, Action: ${newAction}`);
                
                // Perform action
                const result = await this.server.performLoadAction(loadId, newAction);
                
                if (result && result.data) {
                    console.log(`   ✅ Action completed successfully`);
                    this.testResults.artificialStateChanges++;
                    this.testResults.testsPassed++;
                    
                    // Wait a moment, then check state change was detected
                    setTimeout(() => {
                        console.log(`   📡 Waiting for state change broadcast...`);
                    }, 2000);
                } else {
                    console.log(`   ❌ Action failed: No response data`);
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
        }, this.stateChangeIntervalMs);
    }

    async _runForDuration() {
        console.log(`⏱️  Running test for ${this.testDurationMs / 1000 / 60} minutes...\n`);
        
        return new Promise((resolve) => {
            this.testInterval = setTimeout(() => {
                console.log('\n⏰ Test duration completed');
                this.isRunning = false;
                resolve();
            }, this.testDurationMs);
        });
    }

    _generateFinalReport() {
        this.testResults.endTime = new Date();
        this.testResults.totalDuration = this.testResults.endTime.getTime() - this.testResults.startTime.getTime();
        
        console.log('\n==================================================');
        console.log('📋 FINAL TEST REPORT');
        console.log('==================================================');
        console.log(`Start Time: ${this.testResults.startTime.toISOString()}`);
        console.log(`End Time: ${this.testResults.endTime.toISOString()}`);
        console.log(`Total Duration: ${Math.floor(this.testResults.totalDuration / 1000 / 60)}m ${Math.floor((this.testResults.totalDuration / 1000) % 60)}s`);
        console.log('');
        console.log(`✅ Tests Passed: ${this.testResults.testsPassed}`);
        console.log(`❌ Tests Failed: ${this.testResults.testsFailed}`);
        console.log(`🔐 Auth Token Refreshes: ${this.testResults.authTokenRefreshes}`);
        console.log(`🔄 State Changes Detected: ${this.testResults.stateChangesDetected}`);
        console.log(`🎯 Artificial State Changes: ${this.testResults.artificialStateChanges}`);
        console.log('');
        
        if (this.testResults.errors.length > 0) {
            console.log('❌ ERRORS:');
            this.testResults.errors.forEach((error, index) => {
                console.log(`   ${index + 1}. [${error.timestamp.toISOString()}] ${error.type}: ${error.message}`);
            });
            console.log('');
        }
        
        if (this.testResults.connectionIssues.length > 0) {
            console.log('⚠️  CONNECTION ISSUES:');
            this.testResults.connectionIssues.forEach((issue, index) => {
                console.log(`   ${index + 1}. [${issue.timestamp.toISOString()}] ${issue.message}`);
            });
            console.log('');
        }
        
        if (this.testResults.authenticationIssues.length > 0) {
            console.log('🔐 AUTHENTICATION ISSUES:');
            this.testResults.authenticationIssues.forEach((issue, index) => {
                console.log(`   ${index + 1}. [${issue.timestamp.toISOString()}] ${issue.level}: ${issue.message}`);
            });
            console.log('');
        }
        
        // Calculate success rate
        const totalTests = this.testResults.testsPassed + this.testResults.testsFailed;
        const successRate = totalTests > 0 ? (this.testResults.testsPassed / totalTests * 100).toFixed(1) : 0;
        
        console.log(`📈 Overall Success Rate: ${successRate}%`);
        
        // Final assessment
        const isSuccessful = (
            this.testResults.testsFailed === 0 &&
            this.testResults.connectionIssues.length === 0 &&
            this.testResults.authenticationIssues.length === 0 &&
            this.testResults.authTokenRefreshes > 0 && // Should have had at least one token refresh
            this.testResults.stateChangesDetected > 0
        );
        
        if (isSuccessful) {
            console.log('\n🎉 TEST RESULT: SUCCESS - All systems functioning properly');
        } else {
            console.log('\n⚠️  TEST RESULT: ISSUES DETECTED - Review logs above');
        }
        
        console.log('==================================================\n');
        
        // Save results to file
        const fs = require('fs');
        const resultsFile = `test-results-${Date.now()}.json`;
        fs.writeFileSync(resultsFile, JSON.stringify(this.testResults, null, 2));
        console.log(`📄 Detailed results saved to: ${resultsFile}`);
    }

    async _cleanup() {
        console.log('\n🧹 Cleaning up...');
        
        // Clear intervals
        if (this.testInterval) clearTimeout(this.testInterval);
        if (this.stateChangeInterval) clearInterval(this.stateChangeInterval);
        if (this.monitoringInterval) clearInterval(this.monitoringInterval);
        
        // Disconnect client
        if (this.client) {
            try {
                await this.client.disconnect();
                console.log('✅ Client disconnected');
            } catch (error) {
                console.log(`⚠️  Error disconnecting client: ${error.message}`);
            }
        }
        
        // Stop server
        if (this.server) {
            try {
                await this.server.stop();
                console.log('✅ Server stopped');
            } catch (error) {
                console.log(`⚠️  Error stopping server: ${error.message}`);
            }
        }
        
        console.log('✅ Cleanup completed');
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const test = new LongRunningIntegrationTest();
    test.run().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = LongRunningIntegrationTest; 