import type { JoinErrorCode } from '../../api/joinClass';

/**
 * Where each join error is shown and what it says. Class problems send the player back to the
 * class-code step; nickname and rejoin problems stay on the nickname step (offline and unknown
 * too: the class code was fine, the join just didn't land).
 */
export const JOIN_ERRORS: Record<JoinErrorCode, { step: 1 | 2; key: string }> = {
  class_not_found: { step: 1, key: 'onboarding.class.notFound' },
  class_closed: { step: 1, key: 'onboarding.error.class_closed' },
  class_full: { step: 1, key: 'onboarding.error.class_full' },
  rate_limited: { step: 1, key: 'onboarding.error.rate_limited' },
  nickname_taken: { step: 2, key: 'onboarding.error.nickname_taken' },
  nickname_blocked: { step: 2, key: 'onboarding.nickname.rejected' },
  nickname_invalid: { step: 2, key: 'onboarding.nickname.invalid' },
  nickname_personal_info: { step: 2, key: 'onboarding.nickname.personal_info' },
  rejoin_failed: { step: 2, key: 'onboarding.error.rejoin_failed' },
  offline: { step: 2, key: 'onboarding.error.offline' },
  unknown: { step: 2, key: 'onboarding.error.generic' },
};
