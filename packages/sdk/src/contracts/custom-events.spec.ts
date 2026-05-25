// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { isValidCustomTopic } from './custom-events';

describe('isValidCustomTopic', () => {
  it('accepts scoped plugin topics', () => {
    expect(isValidCustomTopic('@shopverse/referral.code-applied')).toBe(true);
    expect(isValidCustomTopic('my-plugin.event-name')).toBe(true);
    expect(isValidCustomTopic('a.b')).toBe(true);
  });

  it('rejects missing parts', () => {
    expect(isValidCustomTopic('@shopverse/referral')).toBe(false); // no dot
    expect(isValidCustomTopic('.event')).toBe(false); // missing id
    expect(isValidCustomTopic('plugin.')).toBe(false); // missing name
    expect(isValidCustomTopic('')).toBe(false);
  });

  it('rejects whitespace in event part', () => {
    expect(isValidCustomTopic('plugin.evt name')).toBe(false);
  });
});
