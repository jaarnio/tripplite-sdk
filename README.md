# Tripplite PDU SDK 2.0

> **Unified SDK for Tripplite PDU devices with integrated real-time WebSocket server**

A modern, easy-to-use Node.js SDK that provides **both direct API access and real-time monitoring** for Tripplite PDU devices. Perfect for building monitoring dashboards, automation systems, and IoT applications.

## ✨ What's New in 2.0

- **🎯 Unified Architecture**: One class handles everything - no more separate server processes
- **⚡ Real-time by Default**: Built-in WebSocket server with automatic polling
- **🔧 Simple Setup**: Configure once, start once - works out of the box
- **📱 Batteries Included**: Server and client SDKs for complete solutions
- **🎪 Easy Integration**: Drop into existing applications with minimal code
- **🔐 Seamless Authentication**: Automatic JWT token management and refresh - no manual intervention

## 🔐 Authentication & Reliability

**The SDK handles all authentication automatically:**
- ✅ **Automatic JWT token parsing** - reads real expiry time from tokens
- ✅ **Proactive token refresh** - refreshes tokens before expiry  
- ✅ **Error recovery** - handles 401 errors with seamless re-authentication
- ✅ **Production ready** - tested with persistent long-running applications
- ✅ **Zero maintenance** - consumers never deal with auth issues

*Your applications will run indefinitely without authentication interruptions.*

---

## 🚀 Quick Start

### 1. Install

```bash
npm install @jaarnio/tripplite-pdu-sdk
```

### 2. Start PDU Server (30 seconds setup)

```javascript
const TripplitePDUServer = require('@jaarnio/tripplite-pdu-sdk');

const server = new TripplitePDUServer({
    host: '192.168.1.100',    // Your PDU IP
    username: 'admin',        // PDU username
    password: 'password'      // PDU password
});

await server.start();

console.log(`🎯 PDU Server running on ws://localhost:${server.getPort()}`);
// That's it! Real-time WebSocket server + PDU polling is now active
```

### 3. Connect Clients for Real-time Monitoring

```javascript
const { TripplitePDUClient } = require('@jaarnio/tripplite-pdu-sdk');

const client = new TripplitePDUClient({
    url: 'ws://localhost:8081',
    onStateChange: (change) => {
        console.log(`Load ${change.loadId}: ${change.previousState} → ${change.currentState}`);
    },
    onActionResult: (result) => {
        console.log(`Action ${result.action} on Load ${result.loadId}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    }
});

    await client.connect();
client.subscribe([1, 2, 3, 4]);  // Monitor loads 1-4
client.sendAction(1, 'on');      // Turn load 1 ON
```

---

## 📖 Complete Usage Guide

### Server-Side: TripplitePDUServer

The server handles PDU communication, polling, and WebSocket connections automatically.

```javascript
const TripplitePDUServer = require('@jaarnio/tripplite-pdu-sdk');

const server = new TripplitePDUServer({
    // PDU Configuration (Required)
    host: '192.168.1.100',         // PDU IP address
    username: 'admin',             // PDU username  
    password: 'password',          // PDU password
    
    // Optional PDU Settings
    port: 443,                     // PDU API port (default: 443)
    deviceId: 1,                   // Device ID (default: 1)
    
    // Optional WebSocket Server Settings
    wsPort: 8081,                  // WebSocket port (default: 8081)
    maxClients: 16,                // Max concurrent clients (default: 16)
    pollInterval: 5000,            // Polling interval ms (default: 5000)
    enableDebug: false             // Debug logging (default: false)
});

// Start everything
await server.start();

// Server provides both real-time AND direct API access
const loads = await server.getAllLoads();
await server.performLoadAction(1, 'on');
const stats = server.getStats();

// Graceful shutdown
await server.stop();
```

### Client-Side: TripplitePDUClient

Connect to the server for real-time monitoring and control.

```javascript
const { TripplitePDUClient } = require('@jaarnio/tripplite-pdu-sdk');

const client = new TripplitePDUClient({
    url: 'ws://localhost:8081',
    
    // Event Handlers
    onConnect: () => console.log('Connected!'),
    onDisconnect: (code, reason) => console.log('Disconnected:', reason),
    onStateChange: (change) => {
        // Real-time load state changes
        updateDashboard(change.loadId, change.currentState);
    },
    onActionResult: (result) => {
        // Action completion feedback
        showNotification(`${result.action} ${result.success ? 'succeeded' : 'failed'}`);
    }
});

await client.connect();

// Subscribe to specific loads for updates
client.subscribe([1, 2, 3, 4, 5, 6, 7, 8]);
    
// Control loads
client.sendAction(1, 'on');      // Turn ON
client.sendAction(2, 'off');     // Turn OFF  
client.sendAction(3, 'cycle');   // Toggle state

// Get current states
const load1State = client.getLoadState(1);
const allStates = client.getAllLoadStates();
```

---

## 🏗️ Use Cases & Examples

### Building a Web Dashboard

```javascript
// server.js - Start PDU server
const server = new TripplitePDUServer({
    host: process.env.PDU_HOST,
    username: process.env.PDU_USERNAME,
    password: process.env.PDU_PASSWORD
});
await server.start();

// dashboard.js - Connect web clients via WebSocket
const client = new TripplitePDUClient({
    url: 'ws://localhost:8081',
    onStateChange: (change) => {
        // Update DOM elements in real-time
        document.getElementById(`load-${change.loadId}`)
            .className = change.currentState === 'LOAD_STATE_ON' ? 'on' : 'off';
                }
});
```

### Automation & Monitoring

```javascript
const server = new TripplitePDUServer({
    host: '192.168.1.100',
    username: 'admin', 
    password: 'password',
    pollInterval: 2000  // Fast polling for automation
});

await server.start();
        
// Direct automation logic
setInterval(async () => {
    const loads = await server.getAllLoads();
    
    // Custom automation: turn off idle loads
    loads.forEach(async (load) => {
        if (load.state === 'LOAD_STATE_ON' && isIdle(load)) {
            await server.performLoadAction(load.id, 'off');
            console.log(`Auto-turned off idle load ${load.id}`);
        }
    });
}, 30000);
```

### Multi-Client Monitoring System

```javascript
// Central server
const server = new TripplitePDUServer({
    host: '192.168.1.100',
    username: 'admin',
    password: 'password',
    maxClients: 50      // Support many clients
});
await server.start();
        
// Multiple monitoring clients can connect
// - Web dashboard
// - Mobile app
// - Alert system
// - Data logger
// - etc.
```

---

## 🔧 Configuration Options

### Environment Variables

Create a `.env` file for easy configuration:

```bash
# PDU Configuration
TRIPPLITE_PDU_HOST=192.168.1.100
TRIPPLITE_PDU_USERNAME=admin
TRIPPLITE_PDU_PASSWORD=password
TRIPPLITE_PDU_PORT=443
TRIPPLITE_PDU_DEVICE_ID=1

# WebSocket Server
WS_PORT=8081
WS_MAX_CLIENTS=16
PDU_POLL_INTERVAL=5000
WS_DEBUG=false
```

### Complete Configuration Reference

```javascript
const server = new TripplitePDUServer({
    // PDU Settings
    host: 'string',              // Required: PDU IP address
    username: 'string',          // Required: PDU username
    password: 'string',          // Required: PDU password
    port: 443,                   // Optional: PDU API port
    deviceId: 1,                 // Optional: Device ID
    
    // WebSocket Server
    wsPort: 8081,                // Optional: WebSocket server port
    maxClients: 16,              // Optional: Maximum concurrent clients
    pollInterval: 5000,          // Optional: PDU polling interval (ms)
    heartbeatInterval: 30000,    // Optional: Client heartbeat interval (ms)
    clientTimeout: 60000,        // Optional: Client timeout (ms)
    
    // Debugging & Advanced
    enableDebug: false,          // Optional: Enable debug logging
    autoStart: false             // Optional: Start server automatically
});
```

---

## 📊 API Reference

### TripplitePDUServer

| Method | Description | Returns |
|--------|-------------|---------|
| `start()` | Start server + polling | `Promise<void>` |
| `stop()` | Stop server gracefully | `Promise<void>` |
| `getAllLoads()` | Get all load states | `Promise<Array>` |
| `performLoadAction(id, action)` | Control a load | `Promise<Object>` |
| `getLoadById(id)` | Get specific load | `Promise<Object>` |
| `getStats()` | Get server statistics | `Object` |
| `getPort()` | Get WebSocket port | `number` |
| `getCurrentStates()` | Get cached load states | `Array` |

### TripplitePDUClient

| Method | Description | Returns |
|--------|-------------|---------|
| `connect()` | Connect to server | `Promise<void>` |
| `disconnect()` | Disconnect from server | `void` |
| `subscribe(loadIds)` | Subscribe to load updates | `boolean` |
| `sendAction(id, action, byName?)` | Send load action | `boolean` |
| `getLoadState(id)` | Get cached load state | `Object\|null` |
| `getAllLoadStates()` | Get all cached states | `Object` |
| `ping()` | Ping server | `boolean` |
| `getStats()` | Request server stats | `boolean` |

---

## 🎮 Examples & Scripts

Run the included examples:

```bash
# Start a PDU server
npm run example:server

# Start an interactive dashboard
npm run example:dashboard

# Use the CLI tool
npx tripplite-server
```

Example files are in the `/examples` directory:
- `basic-server.js` - Simple server setup
- `dashboard-client.js` - Interactive monitoring dashboard

---

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

---

## ⚡ Migration from 1.x

**Version 2.0 is a complete rewrite** with a much simpler API. If you're upgrading:

**Old (1.x):**
```javascript
// Separate components, complex setup
const TripplitePDU = require('@jaarnio/tripplite-pdu-sdk');
const server = require('./websocket-server/start-server.js');
const client = require('./websocket-server/client-sdk.js');
// Multiple configuration files, separate processes...
```

**New (2.x):**
```javascript
// Unified, simple
const TripplitePDUServer = require('@jaarnio/tripplite-pdu-sdk');
const { TripplitePDUClient } = require('@jaarnio/tripplite-pdu-sdk');
// One configuration, one process, much simpler!
```

---

## 🛠️ Development

```bash
# Clone and setup
git clone https://github.com/jaarnio/tripplite-pdu-sdk.git
cd tripplite-pdu-sdk
npm install

# Build
npm run build

# Lint
npm run lint
npm run lint:fix

# Test
npm test
```

---

## 📄 License

MIT © [jaarnio](https://github.com/jaarnio)

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📞 Support

- 🐛 **Issues**: [GitHub Issues](https://github.com/jaarnio/tripplite-pdu-sdk/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/jaarnio/tripplite-pdu-sdk/discussions)
- 📖 **Documentation**: [API Docs](https://github.com/jaarnio/tripplite-pdu-sdk#readme) 