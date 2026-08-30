import { describe, expect, it } from 'vitest';
import {
  decodeClientFrame,
  encodeMessage,
  sanitizeChatText,
  sanitizeSignText,
  stripControls,
  validateClientMessage,
  validateNickname,
  validatePlayerId,
} from '../src/protocol.ts';
import { CHAT_MAX_LEN, SIGN_MAX_LINES } from '../src/constants.ts';

describe('nickname validation', () => {
  it('accepts reasonable names', () => {
    expect(validateNickname('  Ada  ').ok).toBe(true);
    const r = validateNickname('Ada_Lovelace-2');
    expect(r.ok && r.value).toBe('Ada_Lovelace-2');
    expect(validateNickname('Ünicode Ñame').ok).toBe(true);
  });

  it('collapses whitespace and rejects too-short/too-long', () => {
    const r = validateNickname('a   b');
    expect(r.ok && r.value).toBe('a b');
    expect(validateNickname('a').ok).toBe(false);
    expect(validateNickname('x'.repeat(17)).ok).toBe(false);
  });

  it('sanitizes control characters out of names and rejects markup', () => {
    const r = validateNickname('bad\u0000name');
    expect(r.ok && r.value).toBe('badname');
    expect(validateNickname('<script>').ok).toBe(false);
    // RTL overrides are stripped rather than stored.
    const rtl = validateNickname('\u202Ename');
    expect(rtl.ok && rtl.value).toBe('name');
  });
});

describe('playerId validation', () => {
  it('accepts uuid-like and token ids', () => {
    expect(validatePlayerId('3f2504e0-4f89-41d3-9a0c-0305e82c3301').ok).toBe(true);
    expect(validatePlayerId('abcdef1234567890').ok).toBe(true);
  });
  it('rejects malformed ids', () => {
    expect(validatePlayerId('').ok).toBe(false);
    expect(validatePlayerId('short').ok).toBe(false);
    expect(validatePlayerId('../etc/passwd').ok).toBe(false);
    expect(validatePlayerId(42 as unknown).ok).toBe(false);
  });
});

describe('text sanitization', () => {
  it('strips control characters', () => {
    expect(stripControls('a\u0000b\u001fc')).toBe('abc');
  });

  it('chat text is single line, trimmed and length-capped', () => {
    expect(sanitizeChatText('  hello   world ')).toBe('hello world');
    expect(sanitizeChatText('line1\nline2')).toBe('line1 line2');
    expect(sanitizeChatText('x'.repeat(500)).length).toBe(CHAT_MAX_LEN);
    expect(sanitizeChatText(null)).toBe('');
    expect(sanitizeChatText({ evil: '<img>' })).toBe('');
  });

  it('sign text keeps at most N non-empty lines with capped length', () => {
    const text =
      'first\n\nsecond line that is way too long for a sign panel honestly\nthird\nfourth';
    const out = sanitizeSignText(text);
    const lines = out.split('\n');
    expect(lines.length).toBeLessThanOrEqual(SIGN_MAX_LINES);
    expect(lines[0]).toBe('first');
    expect(lines.length).toBe(SIGN_MAX_LINES);
    for (const l of lines) {
      expect(l.length).toBeLessThanOrEqual(24);
    }
  });

  it('sign text removes HTML-relevant control chars but keeps plain text', () => {
    // Plain text rendering is the real XSS defense; sanitization is defense in depth.
    expect(sanitizeSignText('\u202Ertl override<script>')).not.toContain('\u202E');
    expect(sanitizeSignText('hello')).toBe('hello');
  });
});

describe('message validation', () => {
  it('validates a hello message', () => {
    const r = validateClientMessage({
      t: 'hello',
      proto: 1,
      name: 'Ada',
      playerId: 'abcdefgh12345678',
    });
    expect(r.ok).toBe(true);
    const bad = validateClientMessage({
      t: 'hello',
      proto: 99,
      name: 'Ada',
      playerId: 'abcdefgh12345678',
    });
    expect(bad.ok).toBe(false);
  });

  it('rejects out-of-range edit coordinates', () => {
    const base = { t: 'edit', eid: 'aaaaaaaaaaaa', action: 'break' };
    expect(validateClientMessage({ ...base, x: 5, y: 10, z: -7 }).ok).toBe(true);
    expect(validateClientMessage({ ...base, x: 5.5, y: 10, z: -7 }).ok).toBe(false);
    expect(validateClientMessage({ ...base, x: 5, y: -1, z: -7 }).ok).toBe(false);
    expect(validateClientMessage({ ...base, x: 5, y: 9999, z: -7 }).ok).toBe(false);
    expect(validateClientMessage({ ...base, x: 999999999, y: 1, z: 0 }).ok).toBe(false);
  });

  it('requires placeable block ids for placement', () => {
    const place = { t: 'edit', eid: 'aaaaaaaaaaaa', action: 'place', x: 0, y: 40, z: 0 };
    expect(validateClientMessage({ ...place, block: 3 }).ok).toBe(true);
    expect(validateClientMessage({ ...place, block: 12 }).ok).toBe(false); // bedrock
    expect(validateClientMessage({ ...place, block: 0 }).ok).toBe(false); // air
    expect(validateClientMessage({ ...place, block: 999 }).ok).toBe(false);
    expect(validateClientMessage(place).ok).toBe(false); // missing
    expect(validateClientMessage({ ...place, block: 14 }).ok).toBe(true); // wool
    expect(validateClientMessage({ ...place, block: 56 }).ok).toBe(false); // internal door top
  });

  it('validates use messages for interactive blocks', () => {
    expect(validateClientMessage({ t: 'use', eid: 'use00000001', x: 1, y: 2, z: 3 }).ok).toBe(true);
    expect(validateClientMessage({ t: 'use', eid: 'short', x: 1, y: 2, z: 3 }).ok).toBe(false);
    expect(validateClientMessage({ t: 'use', eid: 'use00000002', x: 1, y: -1, z: 3 }).ok).toBe(
      false,
    );
  });

  it('sanitizes sign text inside messages', () => {
    const r = validateClientMessage({
      t: 'sign',
      eid: 'aaaaaaaaaaaa',
      op: 'update',
      x: 1,
      y: 2,
      z: 3,
      text: '  hi \u0000 there \n\nsecond',
    });
    expect(r.ok && r.value.type).not.toBe('never');
    if (r.ok) {
      const sign = r.value as Extract<typeof r.value, { t: 'sign' }>;
      expect(sign.text).toBe('hi there\nsecond');
    }
  });

  it('rejects chat that sanitizes to empty and caps length', () => {
    expect(validateClientMessage({ t: 'chat', text: '   ' }).ok).toBe(false);
    const long = validateClientMessage({ t: 'chat', text: 'y'.repeat(400) });
    expect(long.ok && (long.value as { text: string }).text.length).toBe(200);
  });

  it('rejects unknown types and non-object payloads', () => {
    expect(validateClientMessage({ t: 'nuke' }).ok).toBe(false);
    expect(validateClientMessage('string').ok).toBe(false);
    expect(validateClientMessage([1, 2]).ok).toBe(false);
    expect(validateClientMessage(null).ok).toBe(false);
  });

  it('decodeClientFrame handles bad json', () => {
    expect(decodeClientFrame('{not json').ok).toBe(false);
    const ok = decodeClientFrame(encodeMessage({ t: 'ping', ts: 123 }));
    expect(ok.ok && ok.value).toEqual({ t: 'ping', ts: 123 });
  });

  it('edit ids must be sane tokens', () => {
    const base = { t: 'edit', action: 'break', x: 0, y: 1, z: 2 };
    expect(validateClientMessage({ ...base, eid: 'x'.repeat(8) }).ok).toBe(true);
    expect(validateClientMessage({ ...base, eid: 'x'.repeat(7) }).ok).toBe(false);
    expect(validateClientMessage({ ...base, eid: 'has spaces!!' }).ok).toBe(false);
  });
});
