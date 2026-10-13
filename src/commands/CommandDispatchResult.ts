export type CommandDispatchResult = {
  readonly status:
    | 'executed'
    | 'denied'
    | 'invalid-candidate'
    | 'already-dispatched'
    | 'confirmation-required'
    | 'declined'
    | 'cancelled'
    | 'expired'
    | 'disposed'
    | 'busy';
};
