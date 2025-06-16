// Jest setup file for TripplitePDU tests

// Mock console.log to reduce test output noise unless debugging
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: console.error // Keep error logging for debugging
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.TRIPPLITE_PDU_HOST = 'test-host';
process.env.TRIPPLITE_PDU_USERNAME = 'test-user';
process.env.TRIPPLITE_PDU_PASSWORD = 'test-password';

// Global test timeout
jest.setTimeout(10000); 