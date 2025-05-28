#!/usr/bin/env node

// WebSocket Server Launcher
const TrippliteWebSocketServer = require('./server');
const config = require('./config');

async function startServer() {
    const server = new TrippliteWebSocketServer();
    
    // Graceful shutdown handling
    process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT, shutting down gracefully...');
        await server.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\nReceived SIGTERM, shutting down gracefully...');
        await server.stop();
        process.exit(0);
    });

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        server.stop();
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        server.stop();
        process.exit(1);
    });

    try {
        await server.start();
        console.log('\nServer startup complete!');
        console.log('Press Ctrl+C to stop the server');
        
        // Log server info
        setTimeout(() => {
            const stats = server.getStats();
            console.log('\nServer Status:');
            console.log(`- Running: ${stats.server.isRunning}`);
            console.log(`- Port: ${config.wsPort}`);
            console.log(`- Max Clients: ${config.maxClients}`);
            console.log(`- Poll Interval: ${config.pollInterval}ms`);
            console.log(`- Heartbeat: ${config.heartbeatInterval}ms`);
            console.log('\nReady for client connections...');
        }, 1000);
    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
}

// Start the server
startServer().catch(error => {
    console.error('Startup error:', error);
    process.exit(1);
}); 