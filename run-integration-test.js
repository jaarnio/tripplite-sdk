#!/usr/bin/env node

// Simple runner for the long-running integration test
// This script ensures proper environment setup and provides user-friendly output

const fs = require('fs');
const path = require('path');

console.log('🚀 TRIPPLITE PDU SDK - Long Running Integration Test Runner');
console.log('===========================================================\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    console.log('⚠️  No .env file found. Creating from .env.example...');
    
    const envExamplePath = path.join(__dirname, '.env.example');
    if (fs.existsSync(envExamplePath)) {
        fs.copyFileSync(envExamplePath, envPath);
        console.log('✅ .env file created from .env.example');
        console.log('📝 Please edit .env file with your PDU credentials before running the test\n');
        console.log('Required settings:');
        console.log('  PDU_HOST=your.pdu.ip.address');
        console.log('  PDU_USERNAME=your_username');
        console.log('  PDU_PASSWORD=your_password\n');
        process.exit(1);
    } else {
        console.log('❌ Neither .env nor .env.example found');
        console.log('Please create a .env file with PDU connection details\n');
        process.exit(1);
    }
}

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredVars = ['PDU_HOST', 'PDU_USERNAME', 'PDU_PASSWORD'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.log('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
        console.log(`   ${varName}`);
    });
    console.log('\nPlease set these in your .env file\n');
    process.exit(1);
}

// Display test configuration
console.log('📋 Test Configuration:');
console.log(`   PDU Host: ${process.env.PDU_HOST}:${process.env.PDU_PORT || 443}`);
console.log(`   Username: ${process.env.PDU_USERNAME}`);
console.log(`   Device ID: ${process.env.PDU_DEVICE_ID || 1}`);
console.log(`   WebSocket Port: ${process.env.WS_PORT || 8081}`);
console.log(`   Duration: 15 minutes`);
console.log(`   Poll Interval: 10 seconds (for testing)`);
console.log(`   State Change Tests: Every 90 seconds\n`);

// Ask for confirmation
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('🤔 Are you ready to start the 15-minute integration test? (y/N): ', (answer) => {
    rl.close();
    
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        console.log('\n🎯 Starting integration test...\n');
        
        // Load and run the test
        const LongRunningIntegrationTest = require('./test/long-running-integration');
        const test = new LongRunningIntegrationTest();
        
        // Handle process termination gracefully
        process.on('SIGINT', async () => {
            console.log('\n⏹️  Test interrupted by user (Ctrl+C)');
            await test._cleanup();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            console.log('\n⏹️  Test terminated');
            await test._cleanup();
            process.exit(0);
        });
        
        // Run the test
        test.run().catch(error => {
            console.error('\n❌ Test execution failed:', error.message);
            process.exit(1);
        });
        
    } else {
        console.log('👋 Test cancelled. Run this script again when ready.');
        process.exit(0);
    }
}); 