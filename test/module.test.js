// Basic test to ensure module can be loaded
const TripplitePDU = require('../src/index');

describe('TripplitePDU Module', () => {
  test('module can be imported', () => {
    expect(TripplitePDU).toBeDefined();
    expect(typeof TripplitePDU).toBe('function');
  });

  test('can be instantiated with config', () => {
    const options = {
      host: '192.168.1.1',
      username: 'username',
      password: 'password'
    };
    
    const client = new TripplitePDU(options);
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(TripplitePDU);
  });

  test('ES Module export compatibility', () => {
    const ESModule = require('../src/index').default;
    expect(ESModule).toBeDefined();
    expect(ESModule).toBe(TripplitePDU);
  });
}); 