// Short integration test for demonstration - 3 minutes instead of 15
require('dotenv').config();
const TripplitePDUServer = require('../src/index');
const TripplitePDUClient = require('../src/client');

class ShortIntegrationDemo {
    constructor() {
        this.server = null;
        this.client = null;
        this.testResults = {
            startTime: new Date(),
            endTime: null,
            testsPassed: 0,
            testsFailed: 0,
            authTokenRefreshes: 0,
            stateChangesDetected: 0,
            artificialStateChanges: 0,
            errors: []
        };
        
        // 3-minute demo configuration
        this.testDurationMs = 3 * 60 * 1000; // 3 minutes
        this.stateChangeIntervalMs = 45 * 1000; // Every 45 seconds
        this.monitoringIntervalMs = 20 * 1000; // Every 20 seconds
        
        this.pduConfig = {
            host: process.env.PDU_HOST || '192.168.31.164',
            port: parseInt(process.env.PDU_PORT) || 443,
            username: process.env.PDU_USERNAME || 'power-dev',
            password: process.env.PDU_PASSWORD || 'password',
            deviceId: parseInt(process.env.PDU_DEVICE_ID) || 1,
            wsPort: parseInt(process.env.WS_PORT) || 8081,
            pollInterval: 15000, // 15 second polling
            enableDebug: true
        };
        
        this.testLoadIds = ['1', '2'];
        this.currentTestLoadIndex = 0;
        this.isRunning = false;
    }

    async run() {
        console.log('\n==============================================');
        console.log('TRIPPLITE PDU SDK - SHORT INTEGRATION DEMO');
        console.log('==============================================');
        console.log(`Duration: 3 minutes (demonstration)`);
        console.log(`PDU Host: ${this.pduConfig.host}:${this.pduConfig.port}`);
        console.log(`Username: ${this.pduConfig.username}`);
        console.log(`Poll Interval: ${this.pduConfig.pollInterval}ms`);
        console.log('==============================================\n');

        try {
            this.isRunning = true;
            
            await this._initializeServer();
            await this._connectClient();
            this._startMonitoring();
            this._startStateChangeTests();
            await this._runForDuration();
            this._generateReport();
            
        } catch (error) {
            console.error(`\n❌ Demo failed: ${error.message}`);
            this.testResults.errors.push(error.message);
        } finally {
            await this._cleanup();
        }
    }

    async _initializeServer() {
        console.log('📡 Starting PDU Server...');
        this.server = new TripplitePDUServer(this.pduConfig);
        
        // Monitor authentication events
        const originalLog = this.server.log.bind(this.server);
        this.server.log = (level, message) => {
            originalLog(level, message);
            if (message.includes('refresh') || message.includes('Re-authentication successful')) {
                this.testResults.authTokenRefreshes++;
                console.log(`🔐 TOKEN REFRESH DETECTED: ${message}`);
            }
        };
        
        await this.server.start();
        console.log('✅ Server started');
        this.testResults.testsPassed++;
    }

    async _connectClient() {
        console.log('🔌 Connecting client...');
        this.client = new TripplitePDUClient({
            url: `ws://localhost:${this.pduConfig.wsPort}`,
            onStateChange: (change) => {
                console.log(`🔄 State change: Load ${change.loadId} -> ${change.currentState}`);
                this.testResults.stateChangesDetected++;
            }
        });
        
        await this.client.connect();
        this.client.subscribe(this.testLoadIds);
        console.log(`✅ Client connected and subscribed to loads: ${this.testLoadIds.join(', ')}`);
        this.testResults.testsPassed++;
    }

    _startMonitoring() {
        console.log('👀 Starting monitoring...\n');
        this.monitoringInterval = setInterval(async () => {
            if (!this.isRunning) return;
            
            try {
                const elapsed = Math.floor((Date.now() - this.testResults.startTime.getTime()) / 1000);
                const stats = this.server.getStats();
                
                console.log(`📊 Status (${Math.floor(elapsed / 60)}m ${elapsed % 60}s):`);
                console.log(`   Server: Running=${stats.isRunning}, Polls=${stats.pollCount}, Errors=${stats.errors}`);
                console.log(`   Auth refreshes: ${this.testResults.authTokenRefreshes}`);
                console.log(`   State changes: ${this.testResults.stateChangesDetected}`);
                
                // Test responsiveness
                const loads = await this.server.getAllLoads();
                console.log(`   ✅ API responsive (${loads.length} loads)\n`);
                this.testResults.testsPassed++;
                
            } catch (error) {
                console.log(`❌ Monitoring error: ${error.message}`);
                this.testResults.testsFailed++;
                this.testResults.errors.push(error.message);
            }
        }, this.monitoringIntervalMs);
    }

    _startStateChangeTests() {
        this.stateChangeInterval = setInterval(async () => {
            if (!this.isRunning) return;
            
            try {
                const loadId = this.testLoadIds[this.currentTestLoadIndex];
                this.currentTestLoadIndex = (this.currentTestLoadIndex + 1) % this.testLoadIds.length;
                
                console.log(`🔧 Testing state change on load ${loadId}...`);
                
                const currentLoad = await this.server.getLoadById(loadId);
                const action = currentLoad.state === 1 ? 'off' : 'on';
                
                await this.server.performLoadAction(loadId, action);
                console.log(`   ✅ Action '${action}' sent to load ${loadId}`);
                this.testResults.artificialStateChanges++;
                this.testResults.testsPassed++;
                
            } catch (error) {
                console.log(`❌ State change test failed: ${error.message}`);
                this.testResults.testsFailed++;
                this.testResults.errors.push(error.message);
            }
        }, this.stateChangeIntervalMs);
    }

    async _runForDuration() {
        console.log(`⏱️  Running for 3 minutes...\n`);
        return new Promise(resolve => {
            setTimeout(() => {
                console.log('\n⏰ Demo completed!');
                this.isRunning = false;
                resolve();
            }, this.testDurationMs);
        });
    }

    _generateReport() {
        this.testResults.endTime = new Date();
        const duration = Math.floor((this.testResults.endTime - this.testResults.startTime) / 1000);
        
        console.log('\n==============================================');
        console.log('📋 DEMO RESULTS');
        console.log('==============================================');
        console.log(`Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
        console.log(`✅ Tests Passed: ${this.testResults.testsPassed}`);
        console.log(`❌ Tests Failed: ${this.testResults.testsFailed}`);
        console.log(`🔐 Auth Token Refreshes: ${this.testResults.authTokenRefreshes}`);
        console.log(`🔄 State Changes Detected: ${this.testResults.stateChangesDetected}`);
        console.log(`🎯 Artificial State Changes: ${this.testResults.artificialStateChanges}`);
        
        if (this.testResults.errors.length > 0) {
            console.log('\n❌ Errors:');
            this.testResults.errors.forEach((error, i) => console.log(`   ${i + 1}. ${error}`));
        }
        
        const success = this.testResults.testsFailed === 0 && this.testResults.testsPassed > 0;
        console.log(success ? '\n🎉 DEMO SUCCESSFUL!' : '\n⚠️  Issues detected');
        console.log('==============================================\n');
    }

    async _cleanup() {
        console.log('🧹 Cleaning up...');
        
        if (this.monitoringInterval) clearInterval(this.monitoringInterval);
        if (this.stateChangeInterval) clearInterval(this.stateChangeInterval);
        
        if (this.client) {
            try {
                this.client.disconnect();
                console.log('✅ Client disconnected');
            } catch (error) {
                console.log(`⚠️  Client cleanup error: ${error.message}`);
            }
        }
        
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
    const demo = new ShortIntegrationDemo();
    demo.run().catch(error => {
        console.error('Demo execution failed:', error);
        process.exit(1);
    });
}

module.exports = ShortIntegrationDemo; 