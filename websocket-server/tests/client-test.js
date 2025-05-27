// Test WebSocket Client
const WebSocket = require('ws');

class TestClient {
    constructor(url = 'ws://localhost:8080', name = 'TestClient') {
        this.url = url;
        this.name = name;
        this.ws = null;
        this.connected = false;
        this.clientId = null;
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
                console.log(`[${this.name}] Connected successfully`);
                resolve();
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', (code, reason) => {
                this.connected = false;
                console.log(`[${this.name}] Disconnected: ${code} ${reason}`);
            });

            this.ws.on('error', (error) => {
                console.error(`[${this.name}] Error: ${error.message}`);
                reject(error);
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                if (!this.connected) {
                    reject(new Error('Connection timeout'));
                }
            }, 5000);
        });
    }

    /**
     * Handle incoming message
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            console.log(`[${this.name}] Received:`, JSON.stringify(message, null, 2));

            // Store client ID from welcome message
            if (message.type === 'welcome') {
                this.clientId = message.clientId;
                console.log(`[${this.name}] Assigned client ID: ${this.clientId}`);
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
            console.log(`[${this.name}] Sent:`, JSON.stringify(message, null, 2));
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
        return this.send({
            type: 'subscribe',
            loadIds: loadIds,
            clientId: this.clientId
        });
    }

    /**
     * Unsubscribe from all loads
     */
    unsubscribe() {
        return this.send({
            type: 'unsubscribe',
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
     * Request server stats
     */
    getStats() {
        return this.send({
            type: 'getStats'
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

// Test function
async function runTests() {
    console.log('=== WebSocket Client Test ===\n');

    try {
        // Test 1: Basic connection
        console.log('Test 1: Basic Connection');
        const client1 = new TestClient('ws://localhost:8080', 'Client1');
        await client1.connect();
        await client1.wait(1000);

        // Test 2: Subscription
        console.log('\nTest 2: Subscription');
        client1.subscribe(['1', '5', '12']);
        await client1.wait(2000);

        // Test 3: Ping/Pong
        console.log('\nTest 3: Ping/Pong');
        client1.ping();
        await client1.wait(1000);

        // Test 4: Stats request
        console.log('\nTest 4: Stats Request');
        client1.getStats();
        await client1.wait(2000);

        // Test 5: Multiple clients
        console.log('\nTest 5: Multiple Clients');
        const client2 = new TestClient('ws://localhost:8080', 'Client2');
        const client3 = new TestClient('ws://localhost:8080', 'Client3');
        
        await client2.connect();
        await client3.connect();
        
        client2.subscribe(['2', '8']);
        client3.subscribe(['1', '16']);
        
        await client1.wait(3000);

        // Test 6: Unsubscribe
        console.log('\nTest 6: Unsubscribe');
        client2.unsubscribe();
        await client1.wait(2000);

        // Clean up
        console.log('\nCleaning up...');
        client1.disconnect();
        client2.disconnect();
        client3.disconnect();

        console.log('\n=== Tests completed successfully ===');

    } catch (error) {
        console.error('\n=== Test failed ===');
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = TestClient; 