import { describe, expect, it } from 'vitest';
import { isOriginAllowed, originPolicyFromEnv, parseAllowedOrigins, tokensMatch } from '../src/origin.ts';

describe('origin policy', () => {
  it('parses comma-separated origin lists', () => {
    expect(parseAllowedOrigins('https://a.example, https://b.example ,')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });

  it('enforces exact matches and treats missing origin as non-browser', () => {
    const policy = originPolicyFromEnv('https://user.github.io/eternal-blocks');
    expect(isOriginAllowed(policy, 'https://user.github.io/eternal-blocks')).toBe(true);
    expect(isOriginAllowed(policy, 'https://evil.example')).toBe(false);
    expect(isOriginAllowed(policy, null)).toBe(true);
  });

  it('supports wildcard for local development only', () => {
    const policy = originPolicyFromEnv('*');
    expect(policy.allowAll).toBe(true);
    expect(isOriginAllowed(policy, 'http://localhost:5173')).toBe(true);
  });
});

describe('admin token comparison', () => {
  it('accepts exact matches only', () => {
    expect(tokensMatch('abc123', 'abc123')).toBe(true);
    expect(tokensMatch('abc123', 'abc124')).toBe(false);
    expect(tokensMatch('abc123', undefined)).toBe(false);
    expect(tokensMatch(undefined, 'abc123')).toBe(false);
    expect(tokensMatch('short', 'longer-token')).toBe(false);
  });
});
