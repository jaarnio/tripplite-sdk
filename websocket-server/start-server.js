#!/usr/bin/env node

// WebSocket Server Launcher
const TrippliteWebSocketServer = require('./server');
const config = require('./config');

// Create server instance
const server = new TrippliteWebSocketServer();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    server.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    server.stop();
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

// Start the server
try {
    console.log('=== Tripplite WebSocket Server ===');
    console.log('Press Ctrl+C to stop the server\n');
    
    server.start();
    
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