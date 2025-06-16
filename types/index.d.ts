/**
 * Unified Tripplite PDU Server with integrated WebSocket functionality
 */
declare class TripplitePDUServer {
  /**
   * Create a new TripplitePDU server with integrated WebSocket functionality
   * @param options Configuration options
   */
  constructor(options?: {
    // PDU Configuration
    host?: string;              // The IP address or hostname of the PDU
    port?: number;              // The PDU API port number (default: 443)
    username?: string;          // Username for PDU authentication
    password?: string;          // Password for PDU authentication
    deviceId?: number;          // PDU Device ID (default: 1)
    
    // WebSocket Server Configuration
    wsPort?: number;            // WebSocket server port (default: 8081)
    maxClients?: number;        // Maximum WebSocket clients (default: 16)
    pollInterval?: number;      // Polling interval in milliseconds (default: 5000)
    heartbeatInterval?: number; // Heartbeat interval in milliseconds (default: 30000)
    clientTimeout?: number;     // Client timeout in milliseconds (default: 60000)
    enableDebug?: boolean;      // Enable debug logging (default: false)
    autoStart?: boolean;        // Whether to start server automatically (default: false)
  });

  /**
   * Start the PDU server (WebSocket server + polling)
   */
  start(): Promise<void>;

  /**
   * Stop the PDU server
   */
  stop(): Promise<void>;

  /**
   * Get server statistics
   */
  getStats(): {
    startTime: Date | null;
    pollCount: number;
    stateChanges: number;
    messagesReceived: number;
    messagesSent: number;
    connectionsTotal: number;
    errors: number;
    uptime: number;
    isRunning: boolean;
    connectedClients: number;
    wsPort: number;
    pollInterval: number;
    lastPoll: string | null;
  };

  /**
   * Get the WebSocket server port
   */
  getPort(): number;

  /**
   * Get current load states
   */
  getCurrentStates(): Array<{
    id: string;
    name: string;
    description: string;
    state: string;
    lastUpdated: string;
  }>;

  /**
   * Direct API access: Get all loads
   */
  getAllLoads(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    state: string;
  }>>;

  /**
   * Direct API access: Perform load action
   * @param id The load ID
   * @param action The action to perform
   */
  performLoadAction(
    id: string | number,
    action: 'on' | 'off' | 'cycle'
  ): Promise<any>;

  /**
   * Direct API access: Get load by ID
   * @param id The load ID
   */
  getLoadById(id: string | number): Promise<{
    id: string;
    name: string;
    description: string;
    state: string;
  }>;
}

/**
 * Client SDK for connecting to TripplitePDUServer
 */
declare class TripplitePDUClient {
  /**
   * Create a new client to connect to TripplitePDUServer
   * @param options Configuration options
   */
  constructor(options?: {
    url?: string;                // WebSocket server URL (default: 'ws://localhost:8081')
    autoReconnect?: boolean;     // Whether to automatically reconnect (default: true)
    reconnectInterval?: number;  // Reconnection interval in ms (default: 5000)
    onConnect?: () => void;      // Callback when connected
    onDisconnect?: (code: number, reason: string) => void; // Callback when disconnected
    onStateChange?: (change: StateChange) => void; // Callback when load state changes
    onActionResult?: (result: ActionResult) => void; // Callback when action completes
    onError?: (error: Error) => void; // Callback for errors
  });

  /**
   * Connect to the PDU server
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the server
   */
  disconnect(): void;

  /**
   * Subscribe to specific load IDs for real-time updates
   * @param loadIds Array of load IDs to monitor
   */
  subscribe(loadIds: Array<string | number>): boolean;

  /**
   * Send action to control a load
   * @param loadId Load ID to control
   * @param action Action to perform
   * @param byName Whether loadId is a name instead of ID
   */
  sendAction(
    loadId: string | number,
    action: 'on' | 'off' | 'cycle',
    byName?: boolean
  ): boolean;

  /**
   * Get current state of a load
   * @param loadId Load ID
   */
  getLoadState(loadId: string | number): LoadState | null;

  /**
   * Get all current load states
   */
  getAllLoadStates(): Record<string, LoadState>;

  /**
   * Get server statistics
   */
  getStats(): boolean;

  /**
   * Send ping to server
   */
  ping(): boolean;
}

// Type definitions for events and data structures
interface LoadState {
  id: string;
  name: string;
  description: string;
  state: string;
  lastUpdated: string;
}

interface StateChange {
  loadId: string;
  previousState: string | null;
  currentState: string;
  timestamp: string;
  load: LoadState;
}

interface ActionResult {
  loadId: string;
  action: 'on' | 'off' | 'cycle';
  success: boolean;
  result?: any;
  error?: string;
}

// Export both the server and client
export = TripplitePDUServer;
export { TripplitePDUClient, LoadState, StateChange, ActionResult }; 