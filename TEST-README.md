# TripplitePDU SDK Test Script

This directory contains a test script to verify the functionality of the TripplitePDU SDK, specifically the ability to flip the state of a load (toggle between on and off).

## test-flip-state.js

This script:
1. Gets the current state of a specific load
2. Flips the state (off->on or on->off)
3. Waits 5 seconds
4. Checks the load state again to verify the change

### Prerequisites

- Node.js installed
- The TripplitePDU SDK (this package) installed
- Access to a Tripplite PDU device

### Running the Test

1. Edit `test-flip-state.js` and update the configuration:
   ```javascript
   const config = {
     host: 'your-pdu-host',     // Replace with your PDU's hostname or IP address
     username: 'your-username', // Replace with your PDU username
     password: 'your-password', // Replace with your PDU password
     rejectUnauthorized: false  // Set to true in production if using HTTPS
   };
   ```

2. Update the `LOAD_NAME` constant with the name of the load you want to test:
   ```javascript
   const LOAD_NAME = 'your-load-name'; // Default is 'XCG31P000547'
   ```

3. If needed, adjust the `DELAY_MS` value:
   ```javascript
   const DELAY_MS = 5000; // 5 seconds - may need to be increased for some PDUs
   ```

4. Run the script:
   ```bash
   node test-flip-state.js
   ```

### Expected Output

If the script runs successfully, you should see output similar to:

```
Testing load state flipping for: XCG31P000547
---------------------------------------
1. Getting current state of load "XCG31P000547"...
   Current state: {
     "id": "1",
     "name": "XCG31P000547",
     "description": "XC4055-sandbox",
     "state": "LOAD_STATE_ON"
   }
   Load is currently ON. Will flip to OFF

2. Flipping load state to OFF...
   Action response: {
     "meta": { "id": "d496add7-c4a1-4ca1-9d50-d33040afe49d" },
     "data": {
       "type": "loads_execute",
       "id": "1",
       "attributes": { "response": 0 }
     }
   }
   Action execution was successful

3. Waiting for 5000ms to allow the action to take effect...

4. Checking the load state after delay...
   New state: {
     "id": "1",
     "name": "XCG31P000547",
     "description": "XC4055-sandbox",
     "state": "LOAD_STATE_OFF"
   }

5. Verification:
   Initial state: ON
   Current state: OFF
   State successfully changed: YES ✓
```

### Troubleshooting

If the state doesn't change even after a successful action response, try these fixes:

1. **Increase the delay time**: Some PDUs may need more time to process commands. Try increasing the `DELAY_MS` value.
2. **Check permissions**: Ensure your account has sufficient permissions to control loads.
3. **Check security settings**: The PDU might have security settings preventing load control.
4. **Physical connection**: The load might be physically disconnected or malfunctioning.
5. **Load status**: The load might be in a state that prevents control (e.g., locked by another process).
6. **Network issues**: Ensure stable network connectivity to the PDU.

## About the TripplitePDU SDK

The TripplitePDU SDK is a Node.js library for interacting with Tripplite PDU devices. It provides methods for managing loads, checking status, and performing actions like turning loads on and off.

For more information, see the main [README.md](./README.md) file. 