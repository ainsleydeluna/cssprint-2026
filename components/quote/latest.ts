// Ignore an answer that arrives after the florist has left: each request takes a ticket, and
// leaving (cancel) or a newer request makes older tickets stale. Pure, so latest.test.ts covers it.
export function createTickets() {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (ticket: number) => ticket === current,
    cancel: () => void ++current,
  };
}
