# WebSocket Architecture Design

## Overview
Overwatch server architecture where a single server polls the PDU and broadcasts state changes to subscribed WebSocket clients.

## Phase 1 Requirements

### 1. WebSocket Server with Load-Specific Subscriptions
- Each client subscribes to specific loadIDs
- Server only sends updates for subscribed loads
- Support up to 16 simultaneous clients

### 2. PDU Polling with Rate Limiting
- Single polling thread to prevent PDU overload
- Respect authentication limits and session management
- Detect state changes and broadcast only when changes occur

## Client Subscription Protocol

### Connection & Subscription
```javascript
// Client connects
const ws = new WebSocket('ws://overwatch-server:8080');

// Client subscribes to specific loads
ws.send(JSON.stringify({
  type: 'subscribe',
  loadIds: ['1', '5', '12'],
  clientId: 'dashboard-alpha'
}));
```

### Server Response Messages
```javascript
// Subscription confirmation
{
  type: 'subscribed',
  loadIds: ['1', '5', '12'],
  currentStates: [
    { loadId: '1', name: 'XCG31P000547', state: 'LOAD_STATE_ON' },
    { loadId: '5', name: 'Load05', state: 'LOAD_STATE_OFF' }
  ]
}

// State change notification (only for subscribed loads)
{
  type: 'stateChange',
  loadId: '1',
  previousState: 'LOAD_STATE_OFF',
  currentState: 'LOAD_STATE_ON',
  timestamp: '2024-01-15T10:30:00Z'
}

// Action result (when client performs action)
{
  type: 'actionResult',
  loadId: '1',
  action: 'on',
  success: true,
  timestamp: '2024-01-15T10:30:00Z'
}
```

## Polling Strategy

### Rate Limiting Considerations
- **PDU Session Limit**: Need to investigate maximum concurrent sessions
- **Authentication Token Expiry**: Manage token refresh cycles
- **Network Latency**: Factor in response times for polling frequency
- **State Change Detection**: Only broadcast when actual changes occur

### Proposed Polling Intervals
- **Conservative**: 10 seconds (safe for most PDUs)
- **Moderate**: 5 seconds (balance of responsiveness/load)  
- **Aggressive**: 2 seconds (high responsiveness, higher PDU load)

### Error Handling
- Connection loss recovery
- Authentication failure recovery
- Rate limit detection and backoff
- Client notification of server status

## Implementation Plan

### Phase 1a: Basic WebSocket Server
1. WebSocket server with subscription management
2. Client registration and load subscription
3. Basic broadcast functionality

### Phase 1b: PDU Integration
1. Integrate existing SDK for PDU communication
2. Implement polling loop with state change detection
3. Rate limiting and error handling

### Phase 1c: Testing & Optimization
1. Test with multiple clients
2. Measure PDU response times and optimize polling
3. Stress test with 16 concurrent clients

## File Structure
```
/websocket-server/
  ├── server.js              # Main WebSocket server
  ├── pdu-poller.js          # PDU polling service
  ├── subscription-manager.js # Client subscription handling
  ├── config.js              # Server configuration
  └── /tests/
      ├── client-test.js      # Test WebSocket client
      └── load-test.js        # Multi-client stress test
``` 