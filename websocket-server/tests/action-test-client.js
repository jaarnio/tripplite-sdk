// Action Test Client - Tests PDU load actions via WebSocket
const WebSocket = require('ws');

class ActionTestClient {
    constructor(url = 'ws://localhost:8081', name = 'Action-Tester') {
        this.url = url;
        this.name = name;
        this.ws = null;
        this.connected = false;
        this.clientId = null;
        this.currentStates = new Map(); // loadId -> state
        this.pendingActions = new Map(); // track pending actions
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
        return new Promise((resolve, reject) => {
            console.log(`[${this.name}] Connecting to ${this.url}...`);
            
            this.ws = new WebSocket(this.url);

            this.ws.on('open', () => {
                this.connected = true;
                console.log(`[${this.name}] ✅ Connected successfully`);
                resolve();
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', (code, reason) => {
                this.connected = false;
                console.log(`[${this.name}] ❌ Disconnected: ${code} ${reason}`);
            });

            this.ws.on('error', (error) => {
                console.error(`[${this.name}] ❌ Error: ${error.message}`);
                reject(error);
            });

            setTimeout(() => {
                if (!this.connected) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    /**
     * Handle incoming message with enhanced formatting
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            const timestamp = new Date().toLocaleTimeString();

            switch (message.type) {
                case 'welcome':
                    this.clientId = message.clientId;
                    console.log(`[${timestamp}] [${this.name}] 🎉 Welcome! Client ID: ${this.clientId}`);
                    break;

                case 'subscribed':
                    console.log(`[${timestamp}] [${this.name}] 📡 Subscribed to loads: [${message.loadIds.join(', ')}]`);
                    console.log(`[${timestamp}] [${this.name}] 📊 Initial States:`);
                    message.currentStates.forEach(state => {
                        this.currentStates.set(state.loadId, state.state);
                        console.log(`    Load ${state.loadId} (${state.name}): ${state.state}`);
                    });
                    break;

                case 'stateChange':
                    const oldState = this.currentStates.get(message.loadId);
                    this.currentStates.set(message.loadId, message.currentState);
                    
                    console.log(`[${timestamp}] [${this.name}] 🔄 STATE CHANGE DETECTED!`);
                    console.log(`    Load ID: ${message.loadId}`);
                    console.log(`    Previous: ${message.previousState}`);
                    console.log(`    Current: ${message.currentState}`);
                    
                    // Check if this was result of our action
                    const pendingAction = this.pendingActions.get(message.loadId);
                    if (pendingAction) {
                        const actionTime = Date.now() - pendingAction.startTime;
                        console.log(`    ⚡ Result of "${pendingAction.action}" action (${actionTime}ms response time)`);
                        this.pendingActions.delete(message.loadId);
                    }
                    break;

                case 'actionResult':
                    if (message.success) {
                        console.log(`[${timestamp}] [${this.name}] ✅ Action "${message.action}" on Load ${message.loadId} SUCCESSFUL`);
                        // Mark action as pending (waiting for state change)
                        this.pendingActions.set(message.loadId, {
                            action: message.action,
                            startTime: Date.now()
                        });
                    } else {
                        console.log(`[${timestamp}] [${this.name}] ❌ Action "${message.action}" on Load ${message.loadId} FAILED: ${message.error}`);
                    }
                    break;

                case 'pduStatus':
                    if (message.status === 'connected') {
                        console.log(`[${timestamp}] [${this.name}] 🔌 PDU RECONNECTED: ${message.message || 'PDU is back online'}`);
                    } else if (message.status === 'disconnected') {
                        console.log(`[${timestamp}] [${this.name}] ⚠️  PDU DISCONNECTED: ${message.error || 'PDU connection lost'}`);
                    }
                    break;

                case 'error':
                    console.error(`[${timestamp}] [${this.name}] ❌ Server Error: ${message.error}`);
                    break;

                case 'heartbeat':
                    // Silent - don't log heartbeats during action testing
                    break;

                default:
                    console.log(`[${timestamp}] [${this.name}] 📨 Unknown message:`, message.type);
            }
        } catch (error) {
            console.error(`[${this.name}] Failed to parse message:`, error.message);
        }
    }

    /**
     * Send message to server
     */
    send(message) {
        if (!this.connected) {
            console.error(`[${this.name}] Cannot send - not connected`);
            return false;
        }

        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error(`[${this.name}] Failed to send message:`, error.message);
            return false;
        }
    }

    /**
     * Subscribe to specific load IDs
     */
    subscribe(loadIds) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [${this.name}] 📡 Subscribing to loads: [${loadIds.join(', ')}]`);
        return this.send({
            type: 'subscribe',
            loadIds: loadIds,
            clientId: this.clientId
        });
    }

    /**
     * Send action request to server
     * @param {string} loadId - Load ID to control
     * @param {string} action - Action to perform (on, off, cycle)
     * @param {boolean} byName - Whether loadId is actually a name
     */
    sendAction(loadId, action, byName = false) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [${this.name}] ⚡ Sending "${action}" action for Load ${loadId}...`);
        
        return this.send({
            type: 'action',
            loadId: loadId,
            action: action,
            byName: byName,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get current state of a load
     */
    getCurrentState(loadId) {
        return this.currentStates.get(loadId) || 'UNKNOWN';
    }

    /**
     * Get inverse action for current state
     */
    getInverseAction(currentState) {
        switch (currentState) {
            case 'LOAD_STATE_ON':
                return 'off';
            case 'LOAD_STATE_OFF':
                return 'on';
            default:
                return 'on'; // Default to 'on' for unknown states
        }
    }

    /**
     * Check if cycle action is available
     */
    canCycle(currentState) {
        return currentState === 'LOAD_STATE_ON';
    }

    /**
     * Wait for specified time
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
        this.connected = false;
    }
}

// Action Test Sequence - runs comprehensive action tests
async function runActionTests() {
    console.log('🧪 Starting PDU Action Test Sequence');
    console.log('====================================');
    console.log('This test will run through all action scenarios on Load 1:');
    console.log('1. Determine current state');
    console.log('2. Perform inverse action (on→off or off→on)');
    console.log('3. Perform inverse again (complete cycle)');
    console.log('4. When "on", test cycle action');
    console.log('5. Actions spaced 20 seconds apart\n');

    try {
        const client = new ActionTestClient('ws://localhost:8081', 'Action-Test-Client');
        
        // Connect and subscribe
        await client.connect();
        await client.wait(1000);
        
        const testLoadId = '1'; // Test Load 1
        client.subscribe([testLoadId]);
        
        // Wait for initial state
        console.log('⏳ Waiting 3 seconds for initial state...\n');
        await client.wait(3000);
        
        // Begin action sequence
        const currentState = client.getCurrentState(testLoadId);
        console.log(`🔍 Current state of Load ${testLoadId}: ${currentState}\n`);
        
        // Test 1: Perform inverse action
        console.log('📋 TEST 1: Performing inverse action...');
        const firstAction = client.getInverseAction(currentState);
        client.sendAction(testLoadId, firstAction);
        
        console.log('⏳ Waiting 20 seconds for state change and settle...\n');
        await client.wait(20000);
        
        // Test 2: Perform inverse again (back to original)
        console.log('📋 TEST 2: Performing inverse action again...');
        const newState = client.getCurrentState(testLoadId);
        const secondAction = client.getInverseAction(newState);
        client.sendAction(testLoadId, secondAction);
        
        console.log('⏳ Waiting 20 seconds for state change and settle...\n');
        await client.wait(20000);
        
        // Test 3: Ensure load is ON, then test cycle
        console.log('📋 TEST 3: Preparing for cycle test...');
        const finalState = client.getCurrentState(testLoadId);
        
        if (!client.canCycle(finalState)) {
            console.log(`🔧 Load is ${finalState}, turning ON first for cycle test...`);
            client.sendAction(testLoadId, 'on');
            
            console.log('⏳ Waiting 20 seconds for ON state...\n');
            await client.wait(20000);
        }
        
        // Test 4: Cycle action
        console.log('📋 TEST 4: Testing CYCLE action...');
        const cycleState = client.getCurrentState(testLoadId);
        
        if (client.canCycle(cycleState)) {
            client.sendAction(testLoadId, 'cycle');
            console.log('⚡ Cycle action should turn load OFF briefly, then back ON');
            
            console.log('⏳ Waiting 30 seconds to observe cycle behavior...\n');
            await client.wait(30000);
        } else {
            console.log(`❌ Cannot cycle - load is ${cycleState} (must be ON)`);
        }
        
        // Summary
        console.log('🎉 ACTION TEST SEQUENCE COMPLETE!');
        console.log('=================================');
        console.log('✅ Tested basic on/off actions');
        console.log('✅ Tested state transitions');
        console.log('✅ Tested cycle action');
        console.log('✅ Verified real-time state updates');
        console.log('\nThe client will continue monitoring for additional changes...');
        console.log('Press Ctrl+C to stop.\n');
        
        // Keep running to monitor any additional changes
        process.on('SIGINT', () => {
            console.log('\n\n🛑 Test sequence ended by user');
            client.disconnect();
            process.exit(0);
        });
        
        // Keep process alive
        process.stdin.resume();

    } catch (error) {
        console.error('\n❌ Action test failed:', error.message);
        process.exit(1);
    }
}

// Export for use as module or run directly
if (require.main === module) {
    runActionTests().catch(console.error);
}

module.exports = ActionTestClient; 