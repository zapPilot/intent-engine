const crypto = require('crypto');
const IntentIdGenerator = require('../src/utils/intentIdGenerator');

// Make random deterministic for parts we assert structurally
jest
  .spyOn(crypto, 'randomBytes')
  .mockImplementation(size => Buffer.from('a'.repeat(size)));

describe('IntentIdGenerator', () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('generate returns string with expected parts', () => {
    const id = IntentIdGenerator.generate(
      'dustZap',
      '0x1234567890abcdef1234567890abcdef12345678'
    );
    const parts = id.split('_');
    expect(parts[0]).toBe('dustZap');
    expect(Number.isFinite(Number(parts[1]))).toBe(true);
    // last 6 chars of address
    expect(parts[2]).toBe('345678');
    expect(parts[3]).toMatch(/^[0-9a-f]+$/);
  });

  it('generateShort returns intentType_prefix with hex suffix', () => {
    const id = IntentIdGenerator.generateShort('rebalance');
    expect(id.startsWith('rebalance_')).toBe(true);
    expect(id.split('_')[1]).toMatch(/^[0-9a-f]+$/);
  });

  it('validate checks basic format', () => {
    expect(IntentIdGenerator.validate('')).toBe(false);
    expect(IntentIdGenerator.validate(null)).toBe(false);
    expect(IntentIdGenerator.validate('type_only')).toBe(true);
    expect(IntentIdGenerator.validate('type_123_addr_rand')).toBe(true);
  });

  it('extractIntentType returns first segment or null', () => {
    expect(
      IntentIdGenerator.extractIntentType('swap_123_abcdef_deadbeef')
    ).toBe('swap');
    expect(IntentIdGenerator.extractIntentType('')).toBeNull();
  });

  it('isExpired handles invalid and short IDs conservatively', () => {
    expect(IntentIdGenerator.isExpired('')).toBe(true);
    // short id (no timestamp) considered expired
    expect(IntentIdGenerator.isExpired('type_abcd')).toBe(true);
  });

  it('isExpired returns based on timestamp vs maxAge', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const ts = now - 10_000; // 10s ago
    const freshId = `swap_${ts}_abcdef_deadbeef`;
    expect(IntentIdGenerator.isExpired(freshId, 60_000)).toBe(false);

    const oldTs = now - 120_000; // 2m ago
    const oldId = `swap_${oldTs}_abcdef_deadbeef`;
    expect(IntentIdGenerator.isExpired(oldId, 60_000)).toBe(true);
  });
});
