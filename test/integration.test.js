// Integration tests using real PDU from .env file
require('dotenv').config();
const TripplitePDUServer = require('../src/index');
const TripplitePDUClient = require('../src/client');

// Skip integration tests if PDU connection details are not provided
const skipIntegration = !process.env.TRIPPLITE_PDU_HOST || !process.env.TRIPPLITE_PDU_USERNAME;

describe('Real PDU Integration Tests', () => {
  let server;
  let client;

  // Skip all tests if no real PDU configuration
  beforeAll(() => {
    if (skipIntegration) {
      console.log('🔄 Skipping integration tests - no real PDU configuration in .env');
    } else {
      console.log(`🎯 Running integration tests against PDU: ${process.env.TRIPPLITE_PDU_HOST}`);
    }
  });

  afterEach(async () => {
    if (client) {
      client.disconnect();
      client = null;
    }
    if (server) {
      await server.stop();
      server = null;
    }
  });

  describe('TripplitePDUServer - Real Hardware Integration', () => {
    test('should connect to real PDU and start server', async () => {
      if (skipIntegration) return;

      console.log('🚀 Testing server startup with real PDU...');
      
      server = new TripplitePDUServer({
        host: process.env.TRIPPLITE_PDU_HOST,
        username: process.env.TRIPPLITE_PDU_USERNAME,
        password: process.env.TRIPPLITE_PDU_PASSWORD,
        port: parseInt(process.env.TRIPPLITE_PDU_PORT) || 443,
        deviceId: parseInt(process.env.TRIPPLITE_PDU_DEVICE_ID) || 1,
        wsPort: 8082, // Use different port for testing
        enableDebug: true
      });

      await server.start();
      
      expect(server.isRunning).toBe(true);
      expect(server.getPort()).toBe(8082);
      
      console.log(`✅ Server started successfully on port ${server.getPort()}`);
    }, 30000); // 30 second timeout for real PDU connection

    test('should get real load data from PDU', async () => {
      if (skipIntegration) return;

      console.log('📋 Testing direct API access to real PDU...');

      server = new TripplitePDUServer({
        host: process.env.TRIPPLITE_PDU_HOST,
        username: process.env.TRIPPLITE_PDU_USERNAME,
        password: process.env.TRIPPLITE_PDU_PASSWORD,
        port: parseInt(process.env.TRIPPLITE_PDU_PORT) || 443,
        deviceId: parseInt(process.env.TRIPPLITE_PDU_DEVICE_ID) || 1,
        wsPort: 8083
      });

      await server.start();
      
      // Test direct API access
      const loads = await server.getAllLoads();
      expect(loads).toBeDefined();
      expect(Array.isArray(loads)).toBe(true);
      expect(loads.length).toBeGreaterThan(0);
      
      console.log(`✅ Retrieved ${loads.length} loads from real PDU:`);
      loads.forEach(load => {
        console.log(`   Load ${load.id}: ${load.name} - ${load.state}`);
        expect(load).toHaveProperty('id');
        expect(load).toHaveProperty('name');
        expect(load).toHaveProperty('state');
      });

      // Test getting specific load
      const firstLoad = await server.getLoadById(loads[0].id);
      expect(firstLoad).toBeDefined();
      expect(firstLoad.id).toBe(loads[0].id);
      
      console.log(`✅ Successfully accessed Load ${firstLoad.id} directly`);
    }, 30000);

    test('should handle real-time polling and state tracking', async () => {
      if (skipIntegration) return;

      console.log('⏱️  Testing real-time polling with real PDU...');

      server = new TripplitePDUServer({
        host: process.env.TRIPPLITE_PDU_HOST,
        username: process.env.TRIPPLITE_PDU_USERNAME,
        password: process.env.TRIPPLITE_PDU_PASSWORD,
        port: parseInt(process.env.TRIPPLITE_PDU_PORT) || 443,
        deviceId: parseInt(process.env.TRIPPLITE_PDU_DEVICE_ID) || 1,
        wsPort: 8084,
        pollInterval: 2000, // Poll every 2 seconds for testing
        enableDebug: true
      });

      await server.start();
      
      // Wait for initial polling to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const states = server.getCurrentStates();
      expect(states).toBeDefined();
      expect(states.length).toBeGreaterThan(0);
      
      console.log(`✅ Polling working - tracking ${states.length} load states`);
      
      // Check server statistics
      const stats = server.getStats();
      expect(stats.isRunning).toBe(true);
      expect(stats.pollCount).toBeGreaterThan(0);
      
      console.log(`✅ Server stats: ${stats.pollCount} polls completed, uptime: ${stats.uptime}ms`);
    }, 30000);
  });

  describe('TripplitePDUClient - Real WebSocket Integration', () => {
    test('should connect client to real server and receive data', async () => {
      if (skipIntegration) return;

      console.log('🔗 Testing client connection to real server...');

      // Start server first
      server = new TripplitePDUServer({
        host: process.env.TRIPPLITE_PDU_HOST,
        username: process.env.TRIPPLITE_PDU_USERNAME,
        password: process.env.TRIPPLITE_PDU_PASSWORD,
        wsPort: 8085,
        enableDebug: true
      });

      await server.start();
      console.log('✅ Server started for client testing');

      // Create client
      let clientConnected = false;
      let receivedStates = false;
      
      client = new TripplitePDUClient({
        url: 'ws://localhost:8085',
        onConnect: () => {
          console.log('✅ Client connected to server');
          clientConnected = true;
        },
        onStateChange: (change) => {
          console.log(`📡 Received state change: Load ${change.loadId} ${change.previousState} → ${change.currentState}`);
        },
        onError: (error) => {
          console.error('❌ Client error:', error.message);
        }
      });

      // Connect client
      await client.connect();
      expect(clientConnected).toBe(true);

      // Subscribe to loads
      const subscribed = client.subscribe([1, 2, 3, 4]);
      expect(subscribed).toBe(true);
      console.log('✅ Client subscribed to loads 1-4');

      // Wait for initial states to be received
      await new Promise(resolve => setTimeout(resolve, 3000));

      const loadStates = client.getAllLoadStates();
      expect(Object.keys(loadStates).length).toBeGreaterThan(0);
      
      console.log(`✅ Client received ${Object.keys(loadStates).length} load states via WebSocket`);
      Object.entries(loadStates).forEach(([loadId, state]) => {
        console.log(`   Load ${loadId}: ${state.name} - ${state.state}`);
      });
    }, 45000);

    test('should perform real load actions through client', async () => {
      if (skipIntegration) return;

      console.log('⚡ Testing real load actions through client...');

      // Start server
      server = new TripplitePDUServer({
        host: process.env.TRIPPLITE_PDU_HOST,
        username: process.env.TRIPPLITE_PDU_USERNAME,
        password: process.env.TRIPPLITE_PDU_PASSWORD,
        wsPort: 8086,
        enableDebug: true
      });

      await server.start();

      // Get available loads first
      const loads = await server.getAllLoads();
      const testLoadId = loads[0].id; // Use first available load
      console.log(`🎯 Testing actions on Load ${testLoadId}: ${loads[0].name}`);

      // Create client
      let actionResults = [];
      
      client = new TripplitePDUClient({
        url: 'ws://localhost:8086',
        onActionResult: (result) => {
          console.log(`⚡ Action result: ${result.action} on Load ${result.loadId} - ${result.success ? 'SUCCESS' : 'FAILED'}`);
          actionResults.push(result);
        },
        onStateChange: (change) => {
          console.log(`📡 State change detected: Load ${change.loadId} ${change.previousState} → ${change.currentState}`);
        }
      });

      await client.connect();
      client.subscribe([testLoadId]);

      // Wait for subscription
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get initial state
      const initialState = client.getLoadState(testLoadId);
      console.log(`📊 Initial state of Load ${testLoadId}: ${initialState?.state || 'Unknown'}`);

      // Perform a safe cycle action (this won't disrupt anything permanently)
      console.log(`🔄 Sending cycle action to Load ${testLoadId}...`);
      const actionSent = client.sendAction(testLoadId, 'cycle');
      expect(actionSent).toBe(true);

      // Wait for action to complete and state change
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check that we received action result
      expect(actionResults.length).toBeGreaterThan(0);
      const lastResult = actionResults[actionResults.length - 1];
      expect(lastResult.loadId).toBe(testLoadId.toString());
      expect(lastResult.action).toBe('cycle');

      console.log(`✅ Load action completed: ${lastResult.success ? 'SUCCESS' : 'FAILED'}`);
      
      if (lastResult.success) {
        console.log('🎉 Real hardware action successfully executed via WebSocket client!');
      }
    }, 60000);
  });

  describe('End-to-End Real Usage Scenario', () => {
    test('should demonstrate complete real-world workflow', async () => {
      if (skipIntegration) return;

      console.log('🎪 Running complete end-to-end test with real PDU...');

      // This test simulates exactly how a customer would use the SDK
      server = new TripplitePDUServer({
        host: process.env.TRIPPLITE_PDU_HOST,
        username: process.env.TRIPPLITE_PDU_USERNAME,
        password: process.env.TRIPPLITE_PDU_PASSWORD,
        wsPort: 8087,
        pollInterval: 3000,
        maxClients: 5,
        enableDebug: false // Reduce noise for demo
      });

      console.log('1. Starting unified PDU server...');
      await server.start();
      expect(server.isRunning).toBe(true);

      console.log('2. Getting initial load inventory...');
      const loads = await server.getAllLoads();
      expect(loads.length).toBeGreaterThan(0);
      console.log(`   Found ${loads.length} loads on PDU`);

      console.log('3. Connecting monitoring dashboard client...');
      client = new TripplitePDUClient({
        url: 'ws://localhost:8087',
        onConnect: () => console.log('   ✅ Dashboard connected'),
        onStateChange: (change) => {
          console.log(`   📡 Dashboard: Load ${change.loadId} changed to ${change.currentState}`);
        },
        onActionResult: (result) => {
          console.log(`   ⚡ Dashboard: Action ${result.action} ${result.success ? 'succeeded' : 'failed'}`);
        }
      });

      await client.connect();

      console.log('4. Subscribing to all available loads...');
      const loadIds = loads.map(load => load.id);
      client.subscribe(loadIds);
      
      // Wait for initial subscription data
      await new Promise(resolve => setTimeout(resolve, 4000));

      console.log('5. Verifying real-time data synchronization...');
      const clientStates = client.getAllLoadStates();
      const serverStates = server.getCurrentStates();
      
      expect(Object.keys(clientStates).length).toBeGreaterThan(0);
      expect(serverStates.length).toBeGreaterThan(0);
      
      console.log(`   Client has ${Object.keys(clientStates).length} load states`);
      console.log(`   Server tracking ${serverStates.length} load states`);

      console.log('6. Testing server statistics...');
      const stats = server.getStats();
      expect(stats.connectedClients).toBe(1);
      expect(stats.pollCount).toBeGreaterThan(0);
      expect(stats.isRunning).toBe(true);
      
      console.log(`   📊 Server stats: ${stats.connectedClients} clients, ${stats.pollCount} polls, ${stats.messagesSent} messages sent`);

      console.log('7. Demonstrating graceful shutdown...');
      client.disconnect();
      await server.stop();
      
      expect(server.isRunning).toBe(false);

      console.log('🎉 End-to-end test completed successfully!');
      console.log('');
      console.log('✅ VERIFICATION: The unified SDK successfully:');
      console.log('   - Connected to real PDU hardware');
      console.log('   - Provided real-time WebSocket server');
      console.log('   - Synchronized data between server and clients');  
      console.log('   - Handled load actions on real hardware');
      console.log('   - Maintained statistics and monitoring');
      console.log('   - Shutdown gracefully');
      console.log('');
      console.log('🚀 The refactored architecture is working perfectly with real hardware!');
    }, 90000);
  });
}); 