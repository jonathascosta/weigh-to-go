import { describe, expect, it } from 'vitest';
import { minorOf, REVIEW_AFTER, shouldAskForReview } from './feel';

describe('the rating prompt', () => {
  it('waits for a few weigh-ins', () => {
    expect(shouldAskForReview(null, '0.1.0', REVIEW_AFTER - 1)).toBe(false);
    expect(shouldAskForReview(null, '0.1.0', REVIEW_AFTER)).toBe(true);
  });

  it('asks at most once per minor version', () => {
    expect(minorOf('1.4.2')).toBe('1.4');
    expect(shouldAskForReview('1.4', '1.4.2', 50)).toBe(false);
    expect(shouldAskForReview('1.4', '1.5.0', 50)).toBe(true);
  });
});
