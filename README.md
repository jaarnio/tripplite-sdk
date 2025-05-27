# Tripplite PDU SDK

A JavaScript SDK for interacting with Tripplite PDU (Power Distribution Unit) devices.

## Installation

```bash
npm install @jaarnio/tripplite-pdu-sdk
```

## Configuration

You can configure the SDK in two ways:

### 1. Constructor Options (Explicit Configuration)

```javascript
const TripplitePDU = require('@jaarnio/tripplite-pdu-sdk');

const pdu = new TripplitePDU({
  host: '192.168.1.100',  // Required: IP address or hostname of your PDU device
  port: 443,              // Optional: Port number (default: 443)
  username: 'admin',      // Required: Username for authentication
  password: 'password',   // Required: Password for authentication
  deviceId: 1             // Optional: Device ID (default: 1)
});
```

### 2. Environment Variables

Create a `.env` file in your project root (copy from `.env.example` included in this package):

```env
# Tripplite PDU Configuration
TRIPPLITE_PDU_HOST=192.168.1.100
TRIPPLITE_PDU_PORT=443
TRIPPLITE_PDU_USERNAME=admin
TRIPPLITE_PDU_PASSWORD=your_password_here
TRIPPLITE_PDU_DEVICE_ID=1
```

Then create the client without options:

```javascript
const TripplitePDU = require('@jaarnio/tripplite-pdu-sdk');

// Configuration will be loaded from environment variables
const pdu = new TripplitePDU();
```

### 3. Mixed Configuration

You can also mix both approaches - constructor options will override environment variables:

```javascript
const TripplitePDU = require('@jaarnio/tripplite-pdu-sdk');

// Use environment variables for most config, but override host
const pdu = new TripplitePDU({
  host: '192.168.1.200'  // This will override TRIPPLITE_PDU_HOST
});
```

**Environment Variables:**
- `TRIPPLITE_PDU_HOST` - PDU IP address or hostname
- `TRIPPLITE_PDU_PORT` - PDU port (default: 443)
- `TRIPPLITE_PDU_USERNAME` - Authentication username
- `TRIPPLITE_PDU_PASSWORD` - Authentication password
- `TRIPPLITE_PDU_DEVICE_ID` - Device ID (default: 1)

## Usage

```javascript
const TripplitePDU = require('@jaarnio/tripplite-pdu-sdk');

// Create client (configuration via environment variables or constructor options)
const pdu = new TripplitePDU();

// Example: Get all loads
async function getAllLoads() {
  try {
    const loads = await pdu.getAllLoads();
    console.log('Loads:', loads);
  } catch (error) {
    console.error('Error getting loads:', error.message);
  }
}

// Example: Perform an action on a load by ID
async function turnOnLoad(loadId) {
  try {
    const result = await pdu.performLoadActionById(loadId, 'on');
    console.log(`Load ${loadId} turned on:`, result);
    
    // If you want to get the status after the action
    const status = await pdu.getLoadById(loadId);
    console.log(`Load ${loadId} status:`, status);
  } catch (error) {
    console.error(`Error turning on load ${loadId}:`, error.message);
  }
}

// Example: Perform an action on a load by name
async function cycleLoadByName(loadName) {
  try {
    const result = await pdu.performLoadActionByName(loadName, 'cycle');
    console.log(`Load "${loadName}" cycled:`, result);
    
    // If you want to get the status after the action
    // Wait a moment for the action to take effect
    await new Promise(resolve => setTimeout(resolve, 2000));
    const status = await pdu.getLoadByName(loadName);
    console.log(`Load "${loadName}" status:`, status);
  } catch (error) {
    console.error(`Error cycling load "${loadName}":`, error.message);
  }
}

// Don't forget to logout when done to free up session slots
async function cleanup() {
  try {
    await pdu.logout();
    console.log('Successfully logged out');
  } catch (error) {
    console.error('Error during logout:', error.message);
  }
}
```

## API Reference

### Constructor

```javascript
new TripplitePDU([options])
```

Creates a new PDU client instance.

**Parameters:**

- `options` (Object, optional): Configuration options. If not provided, configuration will be loaded from environment variables.
  - `host` (string): IP address or hostname of the PDU. Can also be set via `TRIPPLITE_PDU_HOST` environment variable.
  - `port` (number): Port number (default: 443). Can also be set via `TRIPPLITE_PDU_PORT` environment variable.
  - `username` (string): Username for authentication. Can also be set via `TRIPPLITE_PDU_USERNAME` environment variable.
  - `password` (string): Password for authentication. Can also be set via `TRIPPLITE_PDU_PASSWORD` environment variable.
  - `deviceId` (number): Device ID (default: 1). Can also be set via `TRIPPLITE_PDU_DEVICE_ID` environment variable.

Constructor options take precedence over environment variables. At minimum, `host`, `username`, and `password` must be provided either via options or environment variables.

### Methods

#### `getAllLoads()`

Get all loads and their status.

**Returns:** Promise resolving to an array of load objects.

#### `getLoadById(id)`

Get a load's status by ID.

**Parameters:**
- `id` (string|number): The load ID

**Returns:** Promise resolving to a load object.

#### `getLoadByName(name)`

Get a load's status by name.

**Parameters:**
- `name` (string): The load name

**Returns:** Promise resolving to a load object.

#### `updateLoad(id, name, description)`

Update a load's name and description.

**Parameters:**
- `id` (string|number): The load ID
- `name` (string): New name
- `description` (string): New description

**Returns:** Promise resolving to the updated load object.

#### `performLoadActionById(id, action)`

Perform an action on a load by ID.

**Parameters:**
- `id` (string|number): The load ID
- `action` (string): The action to perform. One of: 'on', 'off', 'cycle'

**Returns:** Promise resolving to the action response.

#### `performLoadActionByName(name, action)`

Perform an action on a load by name.

**Parameters:**
- `name` (string): The load name
- `action` (string): The action to perform. One of: 'on', 'off', 'cycle'

**Returns:** Promise resolving to the action response.

#### `logout()`

Explicitly logout and revoke the authentication token to free up a session slot on the PDU. 

**Important:** Call this method when you're done using the PDU to prevent "Maximum number of sessions has been reached" errors in future connections.

**Returns:** Promise resolving when logout is complete.

## Architecture

This SDK follows a service-oriented architecture:

- **Main Module**: Provides the client interface
- **Auth Service**: Handles authentication and token management
- **Load Service**: Manages operations related to PDU loads (outlets)
- **Config Service**: Manages configuration settings
- **Error Handler**: Provides consistent error handling

The services are implemented as singletons to maintain state across operations.

## Error Handling

All methods return promises that resolve with the requested data or reject with detailed error information. Errors include the original error, HTTP status code (if applicable), and response data to help with debugging.

## License

MIT 