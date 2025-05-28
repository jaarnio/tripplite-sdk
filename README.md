# Tripplite PDU SDK with WebSocket Server

A comprehensive Node.js SDK for interacting with Tripplite PDU devices, featuring a real-time WebSocket server for building monitoring dashboards and applications.

## ✨ Features

- **🔌 Direct PDU Integration** - Connect to Tripplite PDU devices via HTTP/HTTPS
- **🌐 Real-time WebSocket Server** - Live monitoring with up to 16 concurrent clients
- **⚡ Load Control** - Turn loads on/off/cycle with instant feedback
- **🔄 Auto-reconnection** - Handles authentication token expiration automatically
- **📊 Load-specific Subscriptions** - Efficient updates only for loads you care about
- **🛡️ Robust Error Handling** - Comprehensive retry logic and graceful failures
- **🔧 Easy Configuration** - Environment variables for seamless deployment

---

## 🚀 Quick Start

### Server-Side Setup (Deploy the WebSocket Server)

**1. Install the package:**
```bash
npm install @jaarnio/tripplite-pdu-sdk
```

**2. Create environment configuration:**
```bash
# .env file
TRIPPLITE_PDU_HOST=192.168.1.100
TRIPPLITE_PDU_PORT=443
TRIPPLITE_PDU_USERNAME=your_username
TRIPPLITE_PDU_PASSWORD=your_password
TRIPPLITE_PDU_DEVICE_ID=your_device_id

# WebSocket server settings (optional)
WS_PORT=8081
WS_MAX_CLIENTS=16
PDU_POLL_INTERVAL=5000
```

**3. Start the WebSocket server:**
```bash
# Using npm script
npm run server

# Or directly
npx tripplite-server

# Development mode with debug logging
npm run server:dev
```

The server will:
- ✅ Connect to your PDU
- ✅ Start polling for state changes every 5 seconds
- ✅ Accept WebSocket connections on port 8081
- ✅ Handle up to 16 concurrent clients

---

### Client-Side Integration (Build Dashboards/Apps)

**1. Install the client SDK:**
```bash
npm install @jaarnio/tripplite-pdu-sdk
```

**2. Create a simple monitoring client:**
```javascript
const TripplitePDUClient = require('@jaarnio/tripplite-pdu-sdk/websocket-server/client-sdk');

const client = new TripplitePDUClient({
    url: 'ws://your-server:8081',
    onConnect: () => console.log('Connected to PDU server!'),
    onStateChange: (change) => {
        console.log(`Load ${change.loadId}: ${change.previousState} → ${change.currentState}`);
        updateDashboard(change);
    },
    onActionResult: (result) => {
        console.log(`Action ${result.action} on Load ${result.loadId}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    }
});

// Connect and subscribe to specific loads
async function start() {
    await client.connect();
    
    // Monitor loads 1, 2, and 3
    client.subscribe([1, 2, 3]);
    
    // Control a load
    client.sendAction(1, 'on');   // Turn load 1 ON
    client.sendAction(2, 'off');  // Turn load 2 OFF
    client.sendAction(3, 'cycle'); // Cycle load 3 (if currently ON)
}

start();
```

---

## 📋 Usage Examples

### Building a Web Dashboard

**HTML:**
```html
<!DOCTYPE html>
<html>
<head>
    <title>PDU Dashboard</title>
    <style>
        .load { margin: 10px; padding: 15px; border: 1px solid #ccc; }
        .load.on { background-color: #d4edda; }
        .load.off { background-color: #f8d7da; }
        button { margin: 5px; padding: 5px 10px; }
    </style>
</head>
<body>
    <h1>PDU Load Dashboard</h1>
    <div id="loads"></div>
    
    <script src="https://cdn.jsdelivr.net/npm/ws@8/browser.js"></script>
    <script>
        class PDUDashboard {
            constructor() {
                this.ws = new WebSocket('ws://localhost:8081');
                this.loads = new Map();
                this.setupEventHandlers();
            }

            setupEventHandlers() {
                this.ws.onmessage = (event) => {
                    const message = JSON.parse(event.data);
                    
                    if (message.type === 'welcome') {
                        this.subscribe([1, 2, 3, 4, 5, 6, 7, 8]);
                    } else if (message.type === 'subscribed') {
                        this.renderLoads(message.currentStates);
                    } else if (message.type === 'stateChange') {
                        this.updateLoad(message);
                    }
                };
            }

            subscribe(loadIds) {
                this.ws.send(JSON.stringify({
                    type: 'subscribe',
                    loadIds: loadIds
                }));
            }

            sendAction(loadId, action) {
                this.ws.send(JSON.stringify({
                    type: 'action',
                    loadId: loadId,
                    action: action
                }));
            }

            renderLoads(states) {
                const container = document.getElementById('loads');
                container.innerHTML = '';
                
                states.forEach(load => {
                    this.loads.set(load.loadId, load);
                    const div = this.createLoadElement(load);
                    container.appendChild(div);
                });
            }

            createLoadElement(load) {
                const div = document.createElement('div');
                div.className = `load ${load.state === 'LOAD_STATE_ON' ? 'on' : 'off'}`;
                div.id = `load-${load.loadId}`;
                
                const isOn = load.state === 'LOAD_STATE_ON';
                div.innerHTML = `
                    <h3>Load ${load.loadId} - ${load.name}</h3>
                    <p>Status: <strong>${isOn ? 'ON' : 'OFF'}</strong></p>
                    <button onclick="dashboard.sendAction('${load.loadId}', 'on')">Turn ON</button>
                    <button onclick="dashboard.sendAction('${load.loadId}', 'off')">Turn OFF</button>
                    ${isOn ? `<button onclick="dashboard.sendAction('${load.loadId}', 'cycle')">CYCLE</button>` : ''}
                `;
                
                return div;
            }

            updateLoad(change) {
                const element = document.getElementById(`load-${change.loadId}`);
                if (element) {
                    const load = this.loads.get(change.loadId);
                    load.state = change.currentState;
                    element.outerHTML = this.createLoadElement(load).outerHTML;
                }
            }
        }

        const dashboard = new PDUDashboard();
    </script>
</body>
</html>
```

### Node.js Monitoring Service

```javascript
const TripplitePDUClient = require('@jaarnio/tripplite-pdu-sdk/websocket-server/client-sdk');

class PDUMonitoringService {
    constructor() {
        this.client = new TripplitePDUClient({
            url: 'ws://pdu-server:8081',
            onConnect: () => this.onConnect(),
            onStateChange: (change) => this.handleStateChange(change),
            onPDUStatus: (status) => this.handlePDUStatus(status),
            onError: (error) => this.handleError(error)
        });
        
        this.alertThresholds = new Map();
        this.setupAlerts();
    }

    async start() {
        await this.client.connect();
        
        // Monitor critical loads
        this.client.subscribe([1, 2, 3, 4, 5, 6, 7, 8]);
        
        console.log('PDU Monitoring Service started');
    }

    setupAlerts() {
        // Set up alert conditions
        this.alertThresholds.set('1', { critical: true, name: 'Main Server' });
        this.alertThresholds.set('2', { critical: true, name: 'Network Switch' });
        this.alertThresholds.set('3', { critical: false, name: 'Backup System' });
    }

    handleStateChange(change) {
        const alert = this.alertThresholds.get(change.loadId);
        
        if (alert && change.currentState === 'LOAD_STATE_OFF') {
            this.sendAlert({
                severity: alert.critical ? 'CRITICAL' : 'WARNING',
                message: `${alert.name} (Load ${change.loadId}) has turned OFF`,
                timestamp: change.timestamp
            });
        }
        
        // Log all changes
        console.log(`[${change.timestamp}] Load ${change.loadId} (${change.name}): ${change.previousState} → ${change.currentState}`);
    }

    handlePDUStatus(status) {
        if (status.status === 'disconnected') {
            this.sendAlert({
                severity: 'CRITICAL',
                message: `PDU connection lost: ${status.error}`,
                timestamp: status.timestamp
            });
        } else if (status.status === 'connected') {
            console.log(`PDU reconnected: ${status.message}`);
        }
    }

    sendAlert(alert) {
        console.error(`🚨 ${alert.severity}: ${alert.message}`);
        
        // Here you could integrate with:
        // - Email notifications
        // - Slack/Teams webhooks
        // - SMS alerts
        // - Monitoring systems (Prometheus, etc.)
    }

    handleError(error) {
        console.error('PDU Monitoring Error:', error.message);
    }
}

// Start the monitoring service
const monitor = new PDUMonitoringService();
monitor.start().catch(console.error);
```

---

## 🔧 Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRIPPLITE_PDU_HOST` | Required | PDU IP address or hostname |
| `TRIPPLITE_PDU_PORT` | `443` | PDU HTTPS port |
| `TRIPPLITE_PDU_USERNAME` | Required | PDU login username |
| `TRIPPLITE_PDU_PASSWORD` | Required | PDU login password |
| `TRIPPLITE_PDU_DEVICE_ID` | Required | PDU device identifier |
| `WS_PORT` | `8081` | WebSocket server port |
| `WS_MAX_CLIENTS` | `16` | Maximum concurrent clients |
| `PDU_POLL_INTERVAL` | `5000` | PDU polling interval (ms) |
| `PDU_MAX_RETRIES` | `3` | Max retry attempts |
| `PDU_RETRY_DELAY` | `5000` | Retry delay (ms) |
| `WS_HEARTBEAT_INTERVAL` | `30000` | Client heartbeat interval (ms) |
| `WS_CLIENT_TIMEOUT` | `60000` | Client timeout (ms) |
| `WS_DEBUG` | `false` | Enable debug logging |

### Client SDK Options

```javascript
const client = new TripplitePDUClient({
    url: 'ws://localhost:8081',        // WebSocket server URL
    autoReconnect: true,               // Auto-reconnect on disconnect
    reconnectInterval: 5000,           // Reconnect delay (ms)
    name: 'MyDashboard',              // Client name for logging
    
    // Event handlers
    onConnect: () => {},               // Connected to server
    onDisconnect: (code, reason) => {},// Disconnected from server
    onStateChange: (change) => {},     // Load state changed
    onActionResult: (result) => {},    // Action completed
    onPDUStatus: (status) => {},       // PDU connection status
    onError: (error) => {}             // Error occurred
});
```

---

## 📡 WebSocket Protocol

### Client → Server Messages

**Subscribe to loads:**
```json
{
    "type": "subscribe",
    "loadIds": ["1", "2", "3"]
}
```

**Send action:**
```json
{
    "type": "action",
    "loadId": "1",
    "action": "on",
    "byName": false
}
```

**Ping server:**
```json
{
    "type": "ping",
    "timestamp": "2025-01-01T12:00:00Z"
}
```

### Server → Client Messages

**State change notification:**
```json
{
    "type": "stateChange",
    "loadId": "1",
    "name": "Load01",
    "previousState": "LOAD_STATE_OFF",
    "currentState": "LOAD_STATE_ON",
    "timestamp": "2025-01-01T12:00:00Z"
}
```

**Action result:**
```json
{
    "type": "actionResult",
    "loadId": "1",
    "action": "on",
    "success": true,
    "timestamp": "2025-01-01T12:00:00Z"
}
```

---

## 🚀 Deployment

### Production Deployment

**1. Using PM2 (Recommended):**
```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'tripplite-pdu-server',
    script: 'node_modules/@jaarnio/tripplite-pdu-sdk/websocket-server/start-server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**2. Using Docker:**
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY .env ./
EXPOSE 8081

CMD ["npm", "run", "server"]
```

**3. Using systemd service:**
```ini
[Unit]
Description=Tripplite PDU WebSocket Server
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/tripplite-pdu
ExecStart=/usr/bin/node node_modules/@jaarnio/tripplite-pdu-sdk/websocket-server/start-server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

---

## 🧪 Testing

**Test client connection:**
```bash
npm run client:test
```

**Test action commands:**
```bash
npm run client:actions
```

**Debug mode:**
```bash
npm run server:dev
```

---

## 🤝 Integration Examples

### Express.js REST API Bridge

```javascript
const express = require('express');
const TripplitePDUClient = require('@jaarnio/tripplite-pdu-sdk/websocket-server/client-sdk');

const app = express();
app.use(express.json());

const pduClient = new TripplitePDUClient({
    url: 'ws://localhost:8081'
});

// REST endpoints
app.get('/api/loads', (req, res) => {
    res.json(pduClient.getAllLoadStates());
});

app.post('/api/loads/:id/action', async (req, res) => {
    const { id } = req.params;
    const { action } = req.body;
    
    const success = pduClient.sendAction(id, action);
    res.json({ success, loadId: id, action });
});

pduClient.connect().then(() => {
    pduClient.subscribe([1, 2, 3, 4, 5, 6, 7, 8]);
    app.listen(3000, () => console.log('REST API listening on port 3000'));
});
```

### React Dashboard Component

```jsx
import React, { useState, useEffect } from 'react';

const PDUDashboard = () => {
    const [loads, setLoads] = useState({});
    const [connected, setConnected] = useState(false);
    const [ws, setWs] = useState(null);

    useEffect(() => {
        const websocket = new WebSocket('ws://localhost:8081');
        
        websocket.onopen = () => {
            setConnected(true);
            websocket.send(JSON.stringify({
                type: 'subscribe',
                loadIds: ['1', '2', '3', '4']
            }));
        };

        websocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            
            if (message.type === 'subscribed') {
                const loadMap = {};
                message.currentStates.forEach(load => {
                    loadMap[load.loadId] = load;
                });
                setLoads(loadMap);
            } else if (message.type === 'stateChange') {
                setLoads(prev => ({
                    ...prev,
                    [message.loadId]: {
                        ...prev[message.loadId],
                        state: message.currentState
                    }
                }));
            }
        };

        websocket.onclose = () => setConnected(false);
        setWs(websocket);

        return () => websocket.close();
    }, []);

    const sendAction = (loadId, action) => {
        if (ws && connected) {
            ws.send(JSON.stringify({
                type: 'action',
                loadId,
                action
            }));
        }
    };

    return (
        <div className="pdu-dashboard">
            <h2>PDU Dashboard {connected ? '🟢' : '🔴'}</h2>
            <div className="loads-grid">
                {Object.values(loads).map(load => (
                    <div key={load.id} className={`load-card ${load.state === 'LOAD_STATE_ON' ? 'on' : 'off'}`}>
                        <h3>Load {load.id}</h3>
                        <p>{load.name}</p>
                        <p>Status: <strong>{load.state === 'LOAD_STATE_ON' ? 'ON' : 'OFF'}</strong></p>
                        <div className="actions">
                            <button onClick={() => sendAction(load.id, 'on')}>ON</button>
                            <button onClick={() => sendAction(load.id, 'off')}>OFF</button>
                            {load.state === 'LOAD_STATE_ON' && (
                                <button onClick={() => sendAction(load.id, 'cycle')}>CYCLE</button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PDUDashboard;
```

---

## 📚 API Reference

### Core SDK (Direct PDU Access)

```javascript
const TripplitePDU = require('@jaarnio/tripplite-pdu-sdk');

// Basic usage
const pdu = new TripplitePDU({
    host: '192.168.1.100',
    port: 443,
    username: 'admin',
    password: 'password',
    deviceId: 'PDU001'
});

// Or use environment variables
const pdu = new TripplitePDU(); // Reads from .env
```

### WebSocket Client SDK

```javascript
const TripplitePDUClient = require('@jaarnio/tripplite-pdu-sdk/websocket-server/client-sdk');

const client = new TripplitePDUClient(options);
await client.connect();
client.subscribe([1, 2, 3]);
client.sendAction(1, 'on');
const state = client.getLoadState(1);
client.disconnect();
```

---

## ⚠️ Troubleshooting

**Common Issues:**

1. **"Connection failed"** - Check PDU IP, credentials, and network connectivity
2. **"Token expired"** - Server automatically handles re-authentication
3. **"WebSocket connection refused"** - Ensure server is running on correct port
4. **"No state updates"** - Check if client is properly subscribed to loads

**Debug Mode:**
```bash
WS_DEBUG=true npm run server
```

---

## 📝 License

MIT License - see LICENSE file for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

## 📞 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/jaarnio/tripplite-pdu-sdk/issues)
- **Documentation**: Full API documentation available in `/docs`
- **Examples**: Additional examples in `/examples` directory 