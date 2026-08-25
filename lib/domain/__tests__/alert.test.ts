import { ADMIN_ID, LATER, NOW, makeAlert } from '@/lib/domain/__tests__/fixtures';
import {
  ALERT_STATUSES,
  canTransitionAlertStatus,
  isOutstanding,
  isTerminalAlertStatus,
  transitionAlertStatus,
  type AlertStatus,
} from '@/lib/domain/alert';
import { isErr, isOk } from '@/lib/result';

describe('alert status transitions', () => {
  it('allows an open alert to be acknowledged, resolved, or dismissed', () => {
    expect(canTransitionAlertStatus('open', 'acknowledged')).toBe(true);
    expect(canTransitionAlertStatus('open', 'resolved')).toBe(true);
    expect(canTransitionAlertStatus('open', 'dismissed')).toBe(true);
  });

  it('does not reopen a terminal alert', () => {
    for (const terminal of ['resolved', 'dismissed'] as const) {
      for (const next of ALERT_STATUSES) {
        expect(canTransitionAlertStatus(terminal, next)).toBe(false);
      }
    }
  });

  it.each([
    ['open', false],
    ['acknowledged', false],
    ['resolved', true],
    ['dismissed', true],
  ] as [AlertStatus, boolean][])('reports %s as terminal=%s', (status, expected) => {
    expect(isTerminalAlertStatus(status)).toBe(expected);
  });

  it('records who acknowledged, and when', () => {
    const result = transitionAlertStatus(makeAlert(), 'acknowledged', ADMIN_ID, LATER);

    expect(isOk(result) && result.value.acknowledgedBy).toBe(ADMIN_ID);
    expect(isOk(result) && result.value.acknowledgedAt).toBe(LATER);
    expect(isOk(result) && result.value.resolvedAt).toBeNull();
  });

  it('keeps the original acknowledgement when the alert is later resolved', () => {
    const acknowledged = makeAlert({
      status: 'acknowledged',
      acknowledgedAt: NOW,
      acknowledgedBy: ADMIN_ID,
    });

    const result = transitionAlertStatus(acknowledged, 'resolved', ADMIN_ID, LATER);

    expect(isOk(result) && result.value.acknowledgedAt).toBe(NOW);
    expect(isOk(result) && result.value.resolvedAt).toBe(LATER);
  });

  it('stamps resolvedAt when an alert is dismissed, because both end its life', () => {
    const result = transitionAlertStatus(makeAlert(), 'dismissed', ADMIN_ID, LATER);

    expect(isOk(result) && result.value.resolvedAt).toBe(LATER);
  });

  it('refuses to move a resolved alert', () => {
    const result = transitionAlertStatus(
      makeAlert({ status: 'resolved' }),
      'acknowledged',
      ADMIN_ID,
      LATER
    );

    expect(isErr(result)).toBe(true);
  });
});

describe('isOutstanding', () => {
  it.each([
    ['open', true],
    ['acknowledged', true],
    ['resolved', false],
    ['dismissed', false],
  ] as [AlertStatus, boolean][])('is %s -> %s', (status, expected) => {
    expect(isOutstanding(makeAlert({ status }))).toBe(expected);
  });
});
