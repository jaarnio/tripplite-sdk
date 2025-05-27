#!/usr/bin/env node

/**
 * Test script for TripplitePDU SDK
 * 
 * This script uses configuration from the .env file.
 * Make sure you have a .env file with the proper TRIPPLITE_PDU_* variables set.
 * 
 * This script:
 * 1. Gets the current state of a specific load
 * 2. Flips the state (off->on or on->off)
 * 3. Waits 3 seconds
 * 4. Checks the load state again to verify the change
 */

const TripplitePDU = require('./dist');

const LOAD_NAME = 'XCG31P000547';
const DELAY_MS = 5000;

async function flipLoadState() {
  console.log(`Testing load state flipping for: ${LOAD_NAME}`);
  console.log('Configuration loaded from .env file');
  console.log('---------------------------------------');

  try {
    // Initialize PDU client using .env configuration
    const pdu = new TripplitePDU();
    
    // 1. Get current state of the load
    console.log(`1. Getting current state of load "${LOAD_NAME}"...`);
    const initialState = await pdu.getLoadByName(LOAD_NAME);
    console.log(`   Current state: ${JSON.stringify(initialState, null, 2)}`);
    
    // Determine the current state and action needed
    // The API uses 'state' property with values like 'LOAD_STATE_ON', 'LOAD_STATE_OFF'
    const isCurrentlyOn = initialState.state === 'LOAD_STATE_ON';
    const action = isCurrentlyOn ? 'off' : 'on';
    console.log(`   Load is currently ${isCurrentlyOn ? 'ON' : 'OFF'}. Will flip to ${action.toUpperCase()}`);
    
    // 2. Perform the opposite action
    console.log(`\n2. Flipping load state to ${action.toUpperCase()}...`);
    const actionResult = await pdu.performLoadActionByName(LOAD_NAME, action);
    console.log(`   Action response: ${JSON.stringify(actionResult, null, 2)}`);
    
    // Check if the action was successful
    const actionSuccess = actionResult.data && 
                         actionResult.data.attributes && 
                         actionResult.data.attributes.response === 0;
    console.log(`   Action execution was ${actionSuccess ? 'successful' : 'unsuccessful'}`);
    
    if (!actionSuccess) {
      console.error('   Action failed. Check PDU logs for more information.');
      await pdu.logout(); // Make sure to logout even if action failed
      return;
    }
    
    // 3. Wait for the specified delay
    console.log(`\n3. Waiting for ${DELAY_MS}ms to allow the action to take effect...`);
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    
    // 4. Check the load state again to confirm the change
    console.log(`\n4. Checking the load state after delay...`);
    const newState = await pdu.getLoadByName(LOAD_NAME);
    console.log(`   New state: ${JSON.stringify(newState, null, 2)}`);
    
    // 5. Verify if the state changed correctly
    const isNowOn = newState.state === 'LOAD_STATE_ON';
    const stateChanged = isCurrentlyOn !== isNowOn;
    
    console.log(`\n5. Verification:`);
    console.log(`   Initial state: ${isCurrentlyOn ? 'ON' : 'OFF'}`);
    console.log(`   Current state: ${isNowOn ? 'ON' : 'OFF'}`);
    console.log(`   State successfully changed: ${stateChanged ? 'YES ✓' : 'NO ✗'}`);
    
    if (!stateChanged) {
      console.log('\nTroubleshooting suggestions:');
      console.log('1. The PDU might have security settings preventing load control');
      console.log('2. The load might be physically disconnected or malfunctioning');
      console.log('3. The device might require more time for the action to take effect (try increasing DELAY_MS)');
      console.log('4. Check if the user account has sufficient permissions to control loads');
    }
    
    // Logout to clean up the session
    await pdu.logout();
    
  } catch (error) {
    console.error('Error during test:', error.message);
    if (error.response && error.response.data) {
      console.error('API Error Details:', error.response.data);
    }
  }
}

// Run the test
flipLoadState(); 