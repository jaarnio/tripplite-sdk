// Test suite for TripplitePDUClient
const TripplitePDUClient = require('../src/client');

// Mock WebSocket for testing
jest.mock('ws');
const WebSocket = require('ws');

describe('TripplitePDUClient', () => {
  let client;
  let mockWebSocket;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock WebSocket instance
    mockWebSocket = {
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      readyState: 1 // OPEN
    };
    
    // Mock WebSocket constructor
    WebSocket.mockImplementation(() => mockWebSocket);
    
    // Add constants
    WebSocket.OPEN = 1;
    WebSocket.CLOSED = 3;
  });

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
  });

  describe('Constructor', () => {
    test('should create client with default configuration', () => {
      client = new TripplitePDUClient();

      expect(client.url).toBe('ws://localhost:8081');
      expect(client.autoReconnect).toBe(true);
      expect(client.reconnectInterval).toBe(5000);
      expect(client.connected).toBe(false);
    });

    test('should create client with custom configuration', () => {
      const onConnect = jest.fn();
      const onError = jest.fn();
      
      client = new TripplitePDUClient({
        url: 'ws://192.168.1.100:9000',
        autoReconnect: false,
        reconnectInterval: 3000,
        onConnect,
        onError
      });

      expect(client.url).toBe('ws://192.168.1.100:9000');
      expect(client.autoReconnect).toBe(false);
      expect(client.reconnectInterval).toBe(3000);
      expect(client.onConnect).toBe(onConnect);
      expect(client.onError).toBe(onError);
    });
  });

  describe('Connection Management', () => {
    beforeEach(() => {
      client = new TripplitePDUClient({
        url: 'ws://localhost:8081'
      });
    });

    test('should connect successfully', async () => {
      const connectPromise = client.connect();
      
      // Simulate successful connection
      const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')[1];
      openHandler();
      
      await connectPromise;
      
      expect(client.connected).toBe(true);
      expect(WebSocket).toHaveBeenCalledWith('ws://localhost:8081');
    });

    test('should handle connection timeout', async () => {
      jest.useFakeTimers();
      
      const connectPromise = client.connect();
      
      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(10000);
      
      await expect(connectPromise).rejects.toThrow('Connection timeout');
      
      jest.useRealTimers();
    });

    test('should handle connection errors', async () => {
      const connectPromise = client.connect();
      
      // Simulate connection error
      const errorHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'error')[1];
      errorHandler(new Error('Connection failed'));
      
      await expect(connectPromise).rejects.toThrow('Connection failed');
    });

    test('should disconnect properly', () => {
      client.ws = mockWebSocket;
      client.connected = true;
      
      client.disconnect();
      
      expect(client.autoReconnect).toBe(false);
      expect(mockWebSocket.close).toHaveBeenCalled();
    });

    test('should handle disconnection with auto-reconnect', async () => {
      client.connected = true;
      client.autoReconnect = true;
      const scheduleReconnectSpy = jest.spyOn(client, '_scheduleReconnect').mockImplementation();
      
      // Simulate disconnection
      const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')[1];
      closeHandler(1000, 'Normal closure');
      
      expect(client.connected).toBe(false);
      expect(scheduleReconnectSpy).toHaveBeenCalled();
      
      scheduleReconnectSpy.mockRestore();
    });
  });

  describe('Message Handling', () => {
    beforeEach(() => {
      client = new TripplitePDUClient();
      client.connected = true;
      client.ws = mockWebSocket;
    });

    test('should handle welcome message', () => {
      const welcomeMessage = {
        type: 'welcome',
        clientId: 'test-client-123',
        serverTime: new Date().toISOString()
      };
      
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];
      messageHandler(Buffer.from(JSON.stringify(welcomeMessage)));
      
      expect(client.clientId).toBe('test-client-123');
    });

    test('should handle subscribed message', () => {
      const subscribedMessage = {
        type: 'subscribed',
        loadIds: ['1', '2'],
        currentStates: [
          { id: '1', name: 'Load 1', state: 'LOAD_STATE_ON' },
          { id: '2', name: 'Load 2', state: 'LOAD_STATE_OFF' }
        ]
      };
      
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];
      messageHandler(Buffer.from(JSON.stringify(subscribedMessage)));
      
      expect(client.loadStates.get('1')).toEqual({
        id: '1', name: 'Load 1', state: 'LOAD_STATE_ON'
      });
      expect(client.loadStates.get('2')).toEqual({
        id: '2', name: 'Load 2', state: 'LOAD_STATE_OFF'
      });
    });

    test('should handle state change message', () => {
      const onStateChange = jest.fn();
      client.onStateChange = onStateChange;
      
      const stateChangeMessage = {
        type: 'stateChange',
        loadId: '1',
        previousState: 'LOAD_STATE_OFF',
        currentState: 'LOAD_STATE_ON',
        load: { id: '1', name: 'Load 1', state: 'LOAD_STATE_ON' }
      };
      
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];
      messageHandler(Buffer.from(JSON.stringify(stateChangeMessage)));
      
      expect(onStateChange).toHaveBeenCalledWith(stateChangeMessage);
      expect(client.loadStates.get('1')).toEqual({
        id: '1', name: 'Load 1', state: 'LOAD_STATE_ON'
      });
    });

    test('should handle action result message', () => {
      const onActionResult = jest.fn();
      client.onActionResult = onActionResult;
      
      const actionResultMessage = {
        type: 'actionResult',
        loadId: '1',
        action: 'on',
        success: true
      };
      
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];
      messageHandler(Buffer.from(JSON.stringify(actionResultMessage)));
      
      expect(onActionResult).toHaveBeenCalledWith(actionResultMessage);
    });

    test('should handle error messages', () => {
      const onError = jest.fn();
      client.onError = onError;
      
      const errorMessage = {
        type: 'error',
        error: 'Invalid request'
      };
      
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];
      messageHandler(Buffer.from(JSON.stringify(errorMessage)));
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    test('should handle malformed messages gracefully', () => {
      const onError = jest.fn();
      client.onError = onError;
      
      const messageHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'message')[1];
      messageHandler(Buffer.from('invalid json'));
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Load Subscription', () => {
    beforeEach(() => {
      client = new TripplitePDUClient();
      client.connected = true;
      client.ws = mockWebSocket;
    });

    test('should subscribe to loads successfully', () => {
      const result = client.subscribe(['1', '2', '3']);
      
      expect(result).toBe(true);
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'subscribe',
        loadIds: ['1', '2', '3']
      }));
      expect(client.subscribedLoads).toEqual(['1', '2', '3']);
    });

    test('should fail to subscribe when not connected', () => {
      client.connected = false;
      const onError = jest.fn();
      client.onError = onError;
      
      const result = client.subscribe(['1', '2']);
      
      expect(result).toBe(false);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('Load Actions', () => {
    beforeEach(() => {
      client = new TripplitePDUClient();
      client.connected = true;
      client.ws = mockWebSocket;
    });

    test('should send load action successfully', () => {
      const result = client.sendAction('1', 'on');
      
      expect(result).toBe(true);
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'action',
        loadId: '1',
        action: 'on',
        byName: false
      }));
    });

    test('should send load action by name', () => {
      const result = client.sendAction('Load 1', 'off', true);
      
      expect(result).toBe(true);
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'action',
        loadId: 'Load 1',
        action: 'off',
        byName: true
      }));
    });

    test('should validate action types', () => {
      const onError = jest.fn();
      client.onError = onError;
      
      const result = client.sendAction('1', 'invalid');
      
      expect(result).toBe(false);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });

    test('should fail when not connected', () => {
      client.connected = false;
      const onError = jest.fn();
      client.onError = onError;
      
      const result = client.sendAction('1', 'on');
      
      expect(result).toBe(false);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      client = new TripplitePDUClient();
      
      // Setup some test states
      client.loadStates.set('1', { id: '1', name: 'Load 1', state: 'LOAD_STATE_ON' });
      client.loadStates.set('2', { id: '2', name: 'Load 2', state: 'LOAD_STATE_OFF' });
    });

    test('should get load state by ID', () => {
      const state = client.getLoadState('1');
      
      expect(state).toEqual({
        id: '1', name: 'Load 1', state: 'LOAD_STATE_ON'
      });
    });

    test('should return null for unknown load ID', () => {
      const state = client.getLoadState('999');
      
      expect(state).toBeNull();
    });

    test('should get all load states', () => {
      const allStates = client.getAllLoadStates();
      
      expect(allStates).toEqual({
        '1': { id: '1', name: 'Load 1', state: 'LOAD_STATE_ON' },
        '2': { id: '2', name: 'Load 2', state: 'LOAD_STATE_OFF' }
      });
    });
  });

  describe('Utility Functions', () => {
    beforeEach(() => {
      client = new TripplitePDUClient();
      client.connected = true;
      client.ws = mockWebSocket;
    });

    test('should send ping', () => {
      const result = client.ping();
      
      expect(result).toBe(true);
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'ping'
      }));
    });

    test('should request server stats', () => {
      const result = client.getStats();
      
      expect(result).toBe(true);
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'getStats'
      }));
    });

    test('should handle send failures gracefully', () => {
      mockWebSocket.send.mockImplementation(() => {
        throw new Error('Send failed');
      });
      const onError = jest.fn();
      client.onError = onError;
      
      const result = client.ping();
      
      expect(result).toBe(false);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Reconnection Logic', () => {
    beforeEach(() => {
      client = new TripplitePDUClient({
        autoReconnect: true,
        reconnectInterval: 1000
      });
    });

    test('should schedule reconnection', () => {
      jest.useFakeTimers();
      const connectSpy = jest.spyOn(client, 'connect').mockResolvedValue();
      
      client._scheduleReconnect();
      
      expect(client.reconnectTimer).toBeDefined();
      
      // Fast-forward time
      jest.advanceTimersByTime(1000);
      
      expect(connectSpy).toHaveBeenCalled();
      
      connectSpy.mockRestore();
      jest.useRealTimers();
    });

    test('should not schedule multiple reconnections', () => {
      jest.useFakeTimers();
      
      client._scheduleReconnect();
      const firstTimer = client.reconnectTimer;
      
      client._scheduleReconnect();
      const secondTimer = client.reconnectTimer;
      
      expect(firstTimer).toBe(secondTimer);
      
      jest.useRealTimers();
    });
  });
});

describe('Integration Test Scenarios', () => {
  test('should handle typical client workflow', async () => {
    // This test simulates how a real consumer would use the client
    const onConnect = jest.fn();
    const onStateChange = jest.fn();
    const onActionResult = jest.fn();
    
    const client = new TripplitePDUClient({
      url: 'ws://localhost:8081',
      onConnect,
      onStateChange,
      onActionResult
    });

    // Mock WebSocket for this test
    const mockWS = {
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      readyState: 1
    };
    WebSocket.mockImplementation(() => mockWS);

    // Connect
    const connectPromise = client.connect();
    const openHandler = mockWS.on.mock.calls.find(call => call[0] === 'open')[1];
    openHandler();
    await connectPromise;

    expect(onConnect).toHaveBeenCalled();
    expect(client.connected).toBe(true);

    // Subscribe to loads
    client.subscribe([1, 2, 3]);
    expect(mockWS.send).toHaveBeenCalledWith(JSON.stringify({
      type: 'subscribe',
      loadIds: ['1', '2', '3']
    }));

    // Simulate receiving subscribed message
    const messageHandler = mockWS.on.mock.calls.find(call => call[0] === 'message')[1];
    messageHandler(Buffer.from(JSON.stringify({
      type: 'subscribed',
      loadIds: ['1', '2', '3'],
      currentStates: [
        { id: '1', name: 'Load 1', state: 'LOAD_STATE_OFF' }
      ]
    })));

    // Send action
    client.sendAction(1, 'on');
    expect(mockWS.send).toHaveBeenCalledWith(JSON.stringify({
      type: 'action',
      loadId: '1',
      action: 'on',
      byName: false
    }));

    // Simulate action result
    messageHandler(Buffer.from(JSON.stringify({
      type: 'actionResult',
      loadId: '1',
      action: 'on',
      success: true
    })));

    expect(onActionResult).toHaveBeenCalledWith({
      type: 'actionResult',
      loadId: '1',
      action: 'on',
      success: true
    });

    // Simulate state change
    messageHandler(Buffer.from(JSON.stringify({
      type: 'stateChange',
      loadId: '1',
      previousState: 'LOAD_STATE_OFF',
      currentState: 'LOAD_STATE_ON',
      load: { id: '1', name: 'Load 1', state: 'LOAD_STATE_ON' }
    })));

    expect(onStateChange).toHaveBeenCalled();
    expect(client.getLoadState('1')).toEqual({
      id: '1', name: 'Load 1', state: 'LOAD_STATE_ON'
    });

    // Disconnect
    client.disconnect();
    expect(mockWS.close).toHaveBeenCalled();
  });
}); 