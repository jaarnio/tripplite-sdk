// Test script to demonstrate proper session management
const TripplitePDU = require('./dist/index');

async function runTest() {
  let pdu = null;
  
  try {
    console.log('Creating PDU client using .env configuration...');
    // Configuration will be loaded from .env file automatically
    pdu = new TripplitePDU();

    // First, check the current state
    console.log('Checking initial state of load "XCG31P000547"...');
    let initialState = await pdu.getLoadByName('XCG31P000547');
    console.log('Initial state:', initialState);
    
    // Multiple operations with the same PDU instance
    console.log('Performing multiple operations with the same PDU instance...');
    
    // Then cycle the load: if it's OFF, turn it ON; if it's ON, turn it OFF
    const currentState = initialState.state;
    const newAction = currentState === 'LOAD_STATE_ON' ? 'off' : 'on';
    
    console.log(`1. Load is currently ${currentState}. Changing to ${newAction.toUpperCase()}...`);
    let result = await pdu.performLoadActionByName('XCG31P000547', newAction);
    console.log(`   Load action "${newAction}" completed. Response:`, result);
    
    // Wait a moment and check status
    console.log('   Waiting 3 seconds and checking status...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    let status = await pdu.getLoadByName('XCG31P000547');
    console.log(`   Current status after action:`, status);
    
    // Now toggle it back to the original state
    console.log(`2. Changing back to original state...`);
    const returnAction = newAction === 'on' ? 'off' : 'on';
    result = await pdu.performLoadActionByName('XCG31P000547', returnAction);
    console.log(`   Load action "${returnAction}" completed. Response:`, result);
    
    // Wait a moment and check final status
    console.log('   Waiting 3 seconds and checking final status...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    status = await pdu.getLoadByName('XCG31P000547');
    console.log(`   Final status:`, status);
    
    // Get all loads to demonstrate another operation
    console.log(`3. Getting all loads to demonstrate another operation...`);
    const allLoads = await pdu.getAllLoads();
    console.log(`   Found ${allLoads.length} loads in total`);
    
  } catch (error) {
    console.error('Error executing command:', error.message);
    if (error.originalError) {
      console.error('Original error:', error.originalError);
    }
  } finally {
    // IMPORTANT: Always logout to release the session
    if (pdu) {
      console.log('Test complete. Properly logging out to release the session...');
      await pdu.logout();
      console.log('Logout successful!');
    }
  }
}

// Run the test
runTest(); 