// Test WebSocket Client - PDU Port 1 Listener
const WebSocket = require('ws');

class TestClient {
    constructor(url = 'ws://localhost:8081', name = 'PDU-Listener') {
        this.url = url;
        this.name = name;
        this.ws = null;
        this.connected = false;
        this.clientId = null;
        this.subscribedLoads = [];
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

            // Timeout after 10 seconds
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
                    console.log(`[${timestamp}] [${this.name}] 📋 Server Config:`, {
                        maxClients: message.config.maxClients,
                        heartbeat: message.config.heartbeatInterval + 'ms',
                        availableLoads: message.config.availableLoads.length
                    });
                    break;

                case 'subscribed':
                    this.subscribedLoads = message.loadIds;
                    console.log(`[${timestamp}] [${this.name}] 📡 Subscribed to loads: [${message.loadIds.join(', ')}]`);
                    console.log(`[${timestamp}] [${this.name}] 📊 Current States:`);
                    message.currentStates.forEach(state => {
                        console.log(`    Load ${state.loadId} (${state.name}): ${state.state}`);
                    });
                    break;

                case 'stateChange':
                    console.log(`[${timestamp}] [${this.name}] 🔄 STATE CHANGE DETECTED!`);
                    console.log(`    Load ID: ${message.loadId}`);
                    console.log(`    Previous: ${message.previousState}`);
                    console.log(`    Current: ${message.currentState}`);
                    console.log(`    Changed at: ${message.timestamp}`);
                    break;

                case 'heartbeat':
                    // Only show heartbeat every 5th time to reduce noise
                    if (!this.heartbeatCount) this.heartbeatCount = 0;
                    this.heartbeatCount++;
                    if (this.heartbeatCount % 5 === 0) {
                        console.log(`[${timestamp}] [${this.name}] 💓 Heartbeat (${this.heartbeatCount}) - Connected clients: ${message.stats.connectedClients}`);
                    }
                    break;

                case 'pong':
                    console.log(`[${timestamp}] [${this.name}] 🏓 Pong received`);
                    break;

                case 'pduStatus':
                    if (message.status === 'connected') {
                        console.log(`[${timestamp}] [${this.name}] 🔌 PDU RECONNECTED: ${message.message || 'PDU is back online'}`);
                    } else if (message.status === 'disconnected') {
                        console.log(`[${timestamp}] [${this.name}] ⚠️  PDU DISCONNECTED: ${message.error || 'PDU connection lost'}`);
                    }
                    break;

                case 'actionResult':
                    console.log(`[${timestamp}] [${this.name}] ⚡ Action Result:`, {
                        loadId: message.loadId,
                        action: message.action,
                        success: message.success,
                        error: message.error
                    });
                    break;

                case 'error':
                    console.error(`[${timestamp}] [${this.name}] ❌ Server Error: ${message.error}`);
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
     * Send ping to server
     */
    ping() {
        return this.send({
            type: 'ping',
            timestamp: new Date().toISOString()
        });
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

    /**
     * Wait for specified time
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// PDU Port 1 Listener - runs continuously
async function startPDUListener() {
    console.log('🚀 Starting PDU Port 1 Listener');
    console.log('================================');
    console.log('This client will subscribe to PDU Load ID "1" and monitor for state changes.');
    console.log('Make changes to your PDU and watch for real-time updates!');
    console.log('Press Ctrl+C to stop.\n');

    try {
        const client = new TestClient('ws://localhost:8081', 'PDU-Port-1-Listener');
        
        // Connect to server
        await client.connect();
        await client.wait(1000);

        // Subscribe to Load ID "1" (PDU Port 1)
        client.subscribe(['1']);
        
        // Keep the client running and listening
        console.log('\n👂 Listening for state changes on Load ID "1"...');
        console.log('   (Change the state of Load ID "1" on your PDU to see real-time updates)\n');

        // Send periodic pings to keep connection alive and test responsiveness
        setInterval(() => {
            if (client.connected) {
                client.ping();
            }
        }, 60000); // Ping every 60 seconds

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n\n🛑 Received interrupt signal, disconnecting...');
            client.disconnect();
            process.exit(0);
        });

        // Keep the process alive
        process.stdin.resume();

    } catch (error) {
        console.error('\n❌ Failed to start PDU listener:', error.message);
        process.exit(1);
    }
}

// Export for use as module or run directly
if (require.main === module) {
    startPDUListener().catch(console.error);
}

module.exports = TestClient; 