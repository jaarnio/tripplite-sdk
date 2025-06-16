// Test suite for TripplitePDUServer - Unified SDK
const TripplitePDUServer = require('../src/index');

// Mock the auth and load-service modules for testing
jest.mock('../src/lib/auth');
jest.mock('../src/lib/load-service');
jest.mock('../src/lib/config');

const mockAuth = require('../src/lib/auth');
const mockLoadService = require('../src/lib/load-service');
const mockConfig = require('../src/lib/config');

// Mock WebSocket for testing
jest.mock('ws');
const WebSocket = require('ws');

describe('TripplitePDUServer', () => {
  let server;
  let mockLoads;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock data
    mockLoads = [
      { id: '1', name: 'Load 1', description: 'Test Load 1', state: 'LOAD_STATE_OFF' },
      { id: '2', name: 'Load 2', description: 'Test Load 2', state: 'LOAD_STATE_ON' }
    ];

    // Setup mock implementations
    mockConfig.configure = jest.fn();
    mockConfig.getBaseUrl = jest.fn().mockReturnValue('https://192.168.1.100:443/api');
    
    mockAuth.getAccessToken = jest.fn().mockReturnValue('mock-token');
    mockAuth.needsRefresh = jest.fn().mockReturnValue(false);
    mockAuth.login = jest.fn().mockResolvedValue();
    mockAuth.logout = jest.fn().mockResolvedValue();
    
    mockLoadService.getAllLoads = jest.fn().mockResolvedValue(mockLoads);
    mockLoadService.performLoadAction = jest.fn().mockResolvedValue({
      data: { attributes: { response: 0 } }
    });
    mockLoadService.getLoadById = jest.fn().mockResolvedValue({
      data: {
        id: '1',
        attributes: {
          name: 'Load 1',
          description: 'Test Load 1',
          state: 'LOAD_STATE_OFF'
        }
      }
    });

    // Mock WebSocket.Server
    const mockWSServer = {
      on: jest.fn(),
      close: jest.fn((callback) => callback && callback()),
      clients: new Set()
    };
    WebSocket.Server = jest.fn().mockImplementation(() => mockWSServer);
  });

  afterEach(async () => {
    if (server && server.isRunning) {
      await server.stop();
    }
  });

  describe('Constructor', () => {
    test('should create server with default configuration', () => {
      server = new TripplitePDUServer({
        host: '192.168.1.100',
        username: 'test',
        password: 'test'
      });

      expect(server).toBeDefined();
      expect(server.wsPort).toBe(8081);
      expect(server.maxClients).toBe(16);
      expect(server.pollInterval).toBe(5000);
      expect(mockConfig.configure).toHaveBeenCalledWith({
        host: '192.168.1.100',
        username: 'test',
        password: 'test'
      });
    });

    test('should create server with custom WebSocket configuration', () => {
      server = new TripplitePDUServer({
        host: '192.168.1.100',
        username: 'test',
        password: 'test',
        wsPort: 9000,
        maxClients: 32,
        pollInterval: 3000
      });

      expect(server.wsPort).toBe(9000);
      expect(server.maxClients).toBe(32);
      expect(server.pollInterval).toBe(3000);
    });

    test('should not auto-start by default', () => {
      server = new TripplitePDUServer({
        host: '192.168.1.100',
        username: 'test',
        password: 'test'
      });

      expect(server.isRunning).toBe(false);
    });
  });

  describe('Server Lifecycle', () => {
    beforeEach(() => {
      server = new TripplitePDUServer({
        host: '192.168.1.100',
        username: 'test',
        password: 'test'
      });
    });

    test('should start server successfully', async () => {
      await server.start();

      expect(server.isRunning).toBe(true);
      expect(mockLoadService.getAllLoads).toHaveBeenCalled();
      expect(WebSocket.Server).toHaveBeenCalledWith({
        port: 8081,
        maxPayload: 16 * 1024
      });
    });

    test('should stop server successfully', async () => {
      await server.start();
      await server.stop();

      expect(server.isRunning).toBe(false);
      expect(mockAuth.logout).toHaveBeenCalled();
    });

    test('should not start if already running', async () => {
      await server.start();
      const logSpy = jest.spyOn(server, 'log').mockImplementation();
      
      await server.start(); // Try to start again
      
      expect(logSpy).toHaveBeenCalledWith('warn', 'Server is already running');
      logSpy.mockRestore();
    });

    test('should handle start failure gracefully', async () => {
      mockLoadService.getAllLoads.mockRejectedValue(new Error('PDU connection failed'));

      await expect(server.start()).rejects.toThrow('PDU connection failed');
      expect(server.isRunning).toBe(false);
    });
  });

  describe('Direct API Access', () => {
    beforeEach(() => {
      server = new TripplitePDUServer({
        host: '192.168.1.100',
        username: 'test',
        password: 'test'
      });
    });

    test('should get all loads', async () => {
      const loads = await server.getAllLoads();

      expect(loads).toEqual(mockLoads);
      expect(mockLoadService.getAllLoads).toHaveBeenCalled();
    });

    test('should get load by ID', async () => {
      const load = await server.getLoadById('1');

      expect(load).toEqual({
        id: '1',
        name: 'Load 1',
        description: 'Test Load 1',
        state: 'LOAD_STATE_OFF'
      });
      expect(mockLoadService.getLoadById).toHaveBeenCalledWith('1');
    });

    test('should perform load action', async () => {
      const result = await server.performLoadAction('1', 'on');

      expect(result).toEqual({
        data: { attributes: { response: 0 } }
      });
      expect(mockLoadService.performLoadAction).toHaveBeenCalledWith('1', 'on', false);
    });

    test('should handle authentication errors', async () => {
      mockAuth.getAccessToken.mockReturnValue(null);
      
      await server.getAllLoads();
      
      expect(mockAuth.login).toHaveBeenCalled();
    });
  });

  describe('Statistics and Status', () => {
    beforeEach(() => {
      server = new TripplitePDUServer({
        host: '192.168.1.100',
        username: 'test',
        password: 'test'
      });
    });

    test('should return correct port', () => {
      expect(server.getPort()).toBe(8081);
    });

    test('should return initial statistics', () => {
      const stats = server.getStats();

      expect(stats).toMatchObject({
        startTime: null,
        pollCount: 0,
        stateChanges: 0,
        messagesReceived: 0,
        messagesSent: 0,
        connectionsTotal: 0,
        errors: 0,
        isRunning: false,
        connectedClients: 0,
        wsPort: 8081,
        pollInterval: 5000
      });
    });

    test('should return current states', async () => {
      await server.start();
      const states = server.getCurrentStates();

      expect(states).toHaveLength(2);
      expect(states[0]).toMatchObject({
        id: '1',
        name: 'Load 1',
        state: 'LOAD_STATE_OFF'
      });
    });

    test('should update statistics after starting', async () => {
      await server.start();
      const stats = server.getStats();

      expect(stats.startTime).toBeInstanceOf(Date);
      expect(stats.isRunning).toBe(true);
    });
  });

  describe('Environment Variable Configuration', () => {
    beforeEach(() => {
      // Mock environment variables
      process.env.WS_PORT = '9090';
      process.env.WS_MAX_CLIENTS = '20';
      process.env.PDU_POLL_INTERVAL = '3000';
      process.env.WS_DEBUG = 'true';
    });

    afterEach(() => {
      // Clean up environment variables
      delete process.env.WS_PORT;
      delete process.env.WS_MAX_CLIENTS;
      delete process.env.PDU_POLL_INTERVAL;
      delete process.env.WS_DEBUG;
    });

    test('should use environment variables when no options provided', () => {
      server = new TripplitePDUServer({
        host: '192.168.1.100',
        username: 'test',
        password: 'test'
      });

      expect(server.wsPort).toBe(9090);
      expect(server.maxClients).toBe(20);
      expect(server.pollInterval).toBe(3000);
      expect(server.enableDebug).toBe(true);
    });

    test('should prefer constructor options over environment variables', () => {
      server = new TripplitePDUServer({
        host: '192.168.1.100',
        username: 'test',
        password: 'test',
        wsPort: 8080,
        maxClients: 8
      });

      expect(server.wsPort).toBe(8080);
      expect(server.maxClients).toBe(8);
      expect(server.pollInterval).toBe(3000); // Still from env
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      server = new TripplitePDUServer({
        host: '192.168.1.100',
        username: 'test',
        password: 'test'
      });
    });

    test('should handle PDU connection errors', async () => {
      mockLoadService.getAllLoads.mockRejectedValue(new Error('Connection timeout'));

      await expect(server.start()).rejects.toThrow('Connection timeout');
    });

    test('should handle load action errors', async () => {
      mockLoadService.performLoadAction.mockRejectedValue(new Error('Load action failed'));

      await expect(server.performLoadAction('1', 'on')).rejects.toThrow('Load action failed');
    });

    test('should handle malformed API responses', async () => {
      mockLoadService.getLoadById.mockResolvedValue({ invalid: 'response' });

      await expect(server.getLoadById('1')).rejects.toThrow('Invalid response format');
    });
  });
});

describe('Integration Test Scenarios', () => {
  test('should handle typical consumer workflow', async () => {
    // This test simulates how a real consumer would use the SDK
    const server = new TripplitePDUServer({
      host: '192.168.1.100',
      username: 'admin',
      password: 'password',
      wsPort: 8081,
      maxClients: 10,
      pollInterval: 2000
    });

    // Start the server
    await server.start();
    expect(server.isRunning).toBe(true);
    expect(server.getPort()).toBe(8081);

    // Get initial load states
    const loads = await server.getAllLoads();
    expect(loads).toHaveLength(2);

    // Perform actions on loads
    const actionResult = await server.performLoadAction('1', 'on');
    expect(actionResult.data.attributes.response).toBe(0);

    // Get server statistics
    const stats = server.getStats();
    expect(stats.isRunning).toBe(true);
    expect(stats.connectedClients).toBe(0); // No WebSocket clients in this test

    // Clean shutdown
    await server.stop();
    expect(server.isRunning).toBe(false);
  });
}); 