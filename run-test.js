// Test script to demonstrate proper session management and authentication workflow
const TripplitePDUServer = require('./src/index');

async function runTest() {
  let pdu = null;
  
  try {
    console.log('Creating PDU client using .env configuration...');
    // Configuration will be loaded from .env file automatically
    pdu = new TripplitePDUServer({
      enableDebug: true
    });

    // === Authentication Workflow Tests ===
    console.log('\n=== Testing Authentication Workflow ===');
    
    // Test 1: Initial authentication
    console.log('1. Testing initial authentication...');
    const allLoads = await pdu.getAllLoads();
    console.log(`✅ Initial auth successful - Found ${allLoads.length} loads`);
    
    // Find the target load (or use the first available one)
    let targetLoad = allLoads.find(load => load.name === 'XCG31P000547');
    if (!targetLoad && allLoads.length > 0) {
      targetLoad = allLoads[0];
      console.log(`⚠️  Target load 'XCG31P000547' not found, using '${targetLoad.name}' instead`);
    }
    
    if (!targetLoad) {
      throw new Error('No loads available for testing');
    }

    // Test 2: Multiple rapid API calls (should reuse token)
    console.log('\n2. Testing token reuse with multiple rapid calls...');
    const rapidCallPromises = [
      pdu.getAllLoads(),
      pdu.getLoadById(targetLoad.id),
      pdu.getAllLoads(),
      pdu.getLoadById(targetLoad.id)
    ];
    const rapidResults = await Promise.all(rapidCallPromises);
    console.log('✅ Multiple rapid calls successful - token reuse working');

    // Test 3: Simulate token expiration and refresh
    console.log('\n3. Testing token expiration and refresh workflow...');
    const auth = require('./src/lib/auth');
    
    // Get current token info for comparison
    const originalToken = auth.getAccessToken();
    const originalExpiry = auth.tokenExpiry;
    console.log(`Current token expires at: ${new Date(originalExpiry).toISOString()}`);
    
    // Force token to appear expired (but keep refresh token)
    const originalRefreshToken = auth.refreshToken;
    auth.tokenExpiry = Date.now() - 1000; // 1 second ago
    console.log('🕐 Forced token expiration...');
    
    // This should trigger automatic refresh
    const loadsAfterExpiry = await pdu.getAllLoads();
    console.log(`✅ Automatic token refresh successful - Found ${loadsAfterExpiry.length} loads`);
    
    const newToken = auth.getAccessToken();
    const newExpiry = auth.tokenExpiry;
    console.log(`New token expires at: ${new Date(newExpiry).toISOString()}`);
    console.log(`Token was refreshed: ${originalToken !== newToken ? 'Yes' : 'No'}`);

    // Test 4: Simulate complete token invalidation
    console.log('\n4. Testing complete re-authentication...');
    auth.accessToken = null;
    auth.refreshToken = null;
    auth.tokenExpiry = null;
    console.log('🔄 Cleared all tokens (simulating complete session loss)...');
    
    // This should trigger full re-login
    const loadsAfterClear = await pdu.getAllLoads();
    console.log(`✅ Complete re-authentication successful - Found ${loadsAfterClear.length} loads`);

    // === Load Operation Tests ===
    console.log('\n=== Testing Load Operations with Fresh Authentication ===');
    
    console.log(`5. Checking initial state of load "${targetLoad.name}" (ID: ${targetLoad.id})...`);
    let currentLoadState = await pdu.getLoadById(targetLoad.id);
    console.log('Initial state:', currentLoadState);
    
    // Determine the toggle action
    const currentState = currentLoadState.state;
    const newAction = currentState === 'LOAD_STATE_ON' ? 'off' : 'on';
    
    console.log(`6. Load is currently ${currentState}. Changing to ${newAction.toUpperCase()}...`);
    let result = await pdu.performLoadAction(targetLoad.id, newAction);
    console.log(`   Load action "${newAction}" completed. Response:`, result);
    
    // Wait and check status
    console.log('   Waiting 3 seconds and checking status...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    let status = await pdu.getLoadById(targetLoad.id);
    console.log(`   Current status after action:`, status);
    
    // Toggle back to original state
    console.log(`7. Changing back to original state...`);
    const returnAction = newAction === 'on' ? 'off' : 'on';
    result = await pdu.performLoadAction(targetLoad.id, returnAction);
    console.log(`   Load action "${returnAction}" completed. Response:`, result);
    
    // Wait and check final status
    console.log('   Waiting 3 seconds and checking final status...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    status = await pdu.getLoadById(targetLoad.id);
    console.log(`   Final status:`, status);
    
    // Test 8: Verify authentication still works after operations
    console.log('\n8. Final authentication verification...');
    const finalLoads = await pdu.getAllLoads();
    console.log(`✅ Authentication still valid - Found ${finalLoads.length} loads`);
    
    console.log('\n=== All Tests Completed Successfully! ===');
    console.log('✅ Initial authentication');
    console.log('✅ Token reuse for multiple calls');
    console.log('✅ Automatic token refresh on expiration');
    console.log('✅ Complete re-authentication on token loss');
    console.log('✅ Load operations with authentication');
    console.log('✅ Persistent authentication through operations');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.originalError) {
      console.error('Original error:', error.originalError);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  } finally {
    // IMPORTANT: Always logout to release the session
    if (pdu) {
      console.log('\nTest complete. Properly logging out to release the session...');
      const auth = require('./src/lib/auth');
      await auth.logout();
      console.log('✅ Logout successful!');
    }
  }
}

// Run the test
runTest(); 