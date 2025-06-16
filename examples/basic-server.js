#!/usr/bin/env node

/**
 * Basic PDU Server Example
 * 
 * This example shows how to start a Tripplite PDU server with real-time WebSocket functionality.
 * The server will automatically poll your PDU for state changes and broadcast them to connected clients.
 */

const TripplitePDUServer = require('@jaarnio/tripplite-pdu-sdk');

async function startPDUServer() {
    console.log('🚀 Starting Tripplite PDU Server...\n');

    // Create server instance
    const server = new TripplitePDUServer({
        // PDU Configuration
        host: '192.168.1.100',         // Your PDU IP address
        username: 'admin',             // PDU username
        password: 'password',          // PDU password
        port: 443,                     // PDU API port (default: 443)
        deviceId: 1,                   // Device ID (default: 1)
        
        // WebSocket Server Configuration
        wsPort: 8081,                  // WebSocket server port (default: 8081)
        maxClients: 16,                // Maximum concurrent clients (default: 16)
        pollInterval: 5000,            // Polling interval in ms (default: 5000)
        enableDebug: true              // Enable debug logging (default: false)
    });

    try {
        // Start the server
        await server.start();
        
        console.log('✅ PDU Server started successfully!');
        console.log(`🔌 PDU: ${server.getStats().wsPort}`);
        console.log(`🌐 WebSocket: ws://localhost:${server.getPort()}`);
        console.log(`📊 Max clients: ${server.maxClients}`);
        console.log(`⏱️  Poll interval: ${server.pollInterval}ms`);
        console.log('\n📋 Current load states:');
        
        // Display current load states
        const states = server.getCurrentStates();
        states.forEach(load => {
            const status = load.state === 'LOAD_STATE_ON' ? '🟢 ON' : '🔴 OFF';
            console.log(`   Load ${load.id} (${load.name}): ${status}`);
        });
        
        console.log('\n🎯 Ready for client connections!');
        console.log('   Connect using: TripplitePDUClient({ url: "ws://localhost:8081" })');
        
        // You can also use direct API access
        console.log('\n💡 You can also use direct API calls:');
        console.log('   server.getAllLoads()');
        console.log('   server.performLoadAction(1, "on")');
        console.log('   server.getStats()');
        
        // Example: Get server statistics periodically
        setInterval(() => {
            const stats = server.getStats();
            if (stats.connectedClients > 0) {
                console.log(`📈 Connected clients: ${stats.connectedClients}, Messages sent: ${stats.messagesSent}`);
            }
        }, 30000);

    } catch (error) {
        console.error('❌ Failed to start PDU server:', error.message);
        process.exit(1);
    }

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down PDU server...');
        try {
            await server.stop();
            console.log('✅ Server stopped gracefully');
            process.exit(0);
        } catch (error) {
            console.error('❌ Error during shutdown:', error.message);
            process.exit(1);
        }
    });
}

// Handle unhandled errors
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled error:', error.message);
    process.exit(1);
});

// Start the server
startPDUServer(); 