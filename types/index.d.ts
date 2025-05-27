declare class TripplitePDU {
  /**
   * Create a new TripplitePDU client
   * Configuration can be provided via constructor options or environment variables.
   * Environment variables: TRIPPLITE_PDU_HOST, TRIPPLITE_PDU_PORT, 
   * TRIPPLITE_PDU_USERNAME, TRIPPLITE_PDU_PASSWORD, TRIPPLITE_PDU_DEVICE_ID
   * @param options Configuration options (optional if using environment variables)
   */
  constructor(options?: {
    host?: string;        // The IP address or hostname of the PDU
    port?: number;        // The port number (default: 443)
    username?: string;    // Username for authentication
    password?: string;    // Password for authentication
    deviceId?: number;    // Device ID (default: 1)
  });

  /**
   * Get all loads and their status
   */
  getAllLoads(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    state: string;
  }>>;

  /**
   * Get a load's status by ID
   * @param id The load ID
   */
  getLoadById(id: string | number): Promise<{
    id: string;
    name: string;
    description: string;
    state: string;
  }>;

  /**
   * Get a load's status by name
   * @param name The load name
   */
  getLoadByName(name: string): Promise<{
    id: string;
    name: string;
    description: string;
    state: string;
  }>;

  /**
   * Update a load's name and description
   * @param id The load ID
   * @param name New name
   * @param description New description
   */
  updateLoad(
    id: string | number,
    name: string,
    description: string
  ): Promise<{
    id: string;
    name: string;
    description: string;
    state: string;
  }>;

  /**
   * Perform an action on a load by ID
   * @param id The load ID
   * @param action The action to perform
   */
  performLoadActionById(
    id: string | number,
    action: 'on' | 'off' | 'cycle'
  ): Promise<any>;

  /**
   * Perform an action on a load by name
   * @param name The load name
   * @param action The action to perform
   */
  performLoadActionByName(
    name: string,
    action: 'on' | 'off' | 'cycle'
  ): Promise<any>;

  /**
   * Explicitly logout and revoke the token to free up a session slot
   * Call this method when you're done using the PDU to prevent session limit errors
   */
  logout(): Promise<void>;
}

export = TripplitePDU; 