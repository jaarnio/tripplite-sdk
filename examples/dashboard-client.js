#!/usr/bin/env node

/**
 * Dashboard Client Example
 * 
 * This example shows how to create a monitoring dashboard that connects to a TripplitePDUServer
 * and displays real-time load states and allows control actions.
 */

const TripplitePDUClient = require('@jaarnio/tripplite-pdu-sdk/src/client');

async function createDashboard() {
    console.log('📊 Starting PDU Dashboard Client...\n');

    // Create client instance with event handlers
    const client = new TripplitePDUClient({
        url: 'ws://localhost:8081',    // Connect to your PDU server
        autoReconnect: true,           // Automatically reconnect if disconnected
        reconnectInterval: 5000,       // Reconnect every 5 seconds
        
        // Event handlers
        onConnect: () => {
            console.log('✅ Connected to PDU server!');
            console.log('🔄 Subscribing to loads...\n');
            
            // Subscribe to loads 1-8 for monitoring
            client.subscribe([1, 2, 3, 4, 5, 6, 7, 8]);
        },
        
        onDisconnect: (code, reason) => {
            console.log(`❌ Disconnected from server: ${code} ${reason}`);
            console.log('🔄 Will attempt to reconnect...\n');
        },
        
        onStateChange: (change) => {
            const timestamp = new Date().toLocaleTimeString();
            const prevState = change.previousState === 'LOAD_STATE_ON' ? '🟢 ON' : '🔴 OFF';
            const currState = change.currentState === 'LOAD_STATE_ON' ? '🟢 ON' : '🔴 OFF';
            
            console.log(`[${timestamp}] 🔄 Load ${change.loadId} (${change.load.name}): ${prevState} → ${currState}`);
            
            // Update dashboard display
            displayLoadStates();
        },
        
        onActionResult: (result) => {
            const timestamp = new Date().toLocaleTimeString();
            const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
            console.log(`[${timestamp}] ⚡ Action ${result.action.toUpperCase()} on Load ${result.loadId}: ${status}`);
            
            if (!result.success && result.error) {
                console.log(`   Error: ${result.error}`);
            }
        },
        
        onError: (error) => {
            console.error('❌ Client error:', error.message);
        }
    });

    try {
        // Connect to server
        console.log('🔗 Connecting to PDU server...');
        await client.connect();
        
        // Wait a moment for initial states to be received
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Display initial dashboard
        displayDashboard();
        
        // Start interactive control
        startInteractiveControl(client);
        
    } catch (error) {
        console.error('❌ Failed to connect to PDU server:', error.message);
        console.log('💡 Make sure your PDU server is running on ws://localhost:8081');
        process.exit(1);
    }

    function displayDashboard() {
        console.clear();
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║                     PDU DASHBOARD                           ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('');
        displayLoadStates();
        console.log('');
        console.log('📝 Commands:');
        console.log('   on <load_id>    - Turn load ON');
        console.log('   off <load_id>   - Turn load OFF');
        console.log('   cycle <load_id> - Cycle load (OFF→ON or ON→OFF)');
        console.log('   status          - Show current status');
        console.log('   stats           - Request server statistics');
        console.log('   ping            - Ping server');
        console.log('   quit            - Exit dashboard');
        console.log('');
        console.log('💡 Type a command and press Enter:');
    }

    function displayLoadStates() {
        const states = client.getAllLoadStates();
        const loadIds = Object.keys(states).sort((a, b) => parseInt(a) - parseInt(b));
        
        if (loadIds.length === 0) {
            console.log('📭 No load states available yet...');
            return;
        }
        
        console.log('📋 Current Load States:');
        console.log('┌─────────┬─────────────────────────┬────────────┬─────────────────────┐');
        console.log('│ Load ID │ Name                    │ Status     │ Last Updated        │');
        console.log('├─────────┼─────────────────────────┼────────────┼─────────────────────┤');
        
        loadIds.forEach(loadId => {
            const load = states[loadId];
            const status = load.state === 'LOAD_STATE_ON' ? '🟢 ON     ' : '🔴 OFF    ';
            const name = load.name.padEnd(23);
            const lastUpdated = new Date(load.lastUpdated).toLocaleTimeString();
            
            console.log(`│    ${loadId}    │ ${name} │ ${status} │ ${lastUpdated.padEnd(19)} │`);
        });
        
        console.log('└─────────┴─────────────────────────┴────────────┴─────────────────────┘');
    }

    function startInteractiveControl(client) {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: '> '
        });

        rl.prompt();

        rl.on('line', (line) => {
            const [command, ...args] = line.trim().toLowerCase().split(' ');
            
            switch (command) {
                case 'on':
                case 'off':
                case 'cycle':
                    if (args.length === 0) {
                        console.log('❌ Please specify a load ID (e.g., "on 1")');
                    } else {
                        const loadId = args[0];
                        console.log(`⚡ Sending ${command.toUpperCase()} command to Load ${loadId}...`);
                        client.sendAction(loadId, command);
                    }
                    break;
                    
                case 'status':
                    displayLoadStates();
                    break;
                    
                case 'stats':
                    console.log('📊 Requesting server statistics...');
                    client.getStats();
                    break;
                    
                case 'ping':
                    console.log('🏓 Pinging server...');
                    client.ping();
                    break;
                    
                case 'clear':
                    displayDashboard();
                    break;
                    
                case 'quit':
                case 'exit':
                    console.log('👋 Disconnecting from server...');
                    client.disconnect();
                    rl.close();
                    process.exit(0);
                    break;
                    
                case 'help':
                    displayDashboard();
                    break;
                    
                default:
                    if (command) {
                        console.log(`❓ Unknown command: ${command}. Type 'help' for available commands.`);
                    }
            }
            
            rl.prompt();
        });

        rl.on('close', () => {
            console.log('\n👋 Goodbye!');
            client.disconnect();
            process.exit(0);
        });
    }

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down dashboard...');
        client.disconnect();
        process.exit(0);
    });
}

// Handle unhandled errors
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled error:', error.message);
    process.exit(1);
});

// Start the dashboard
createDashboard(); 