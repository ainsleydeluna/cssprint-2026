// Saves the edited reply text (PATCH /api/quotes/[id] { replyText }) after a pause in typing,
// with at most one save in flight (autosave.ts). No React here: reply-save.test.ts.
import { Autosave, type SaveState } from "./autosave";

export const REPLY_SAVE_DELAY_MS = 800;

export function replySaver(initial: string, send: (text: string) => Promise<unknown>, onChange?: (state: SaveState) => void) {
  return new Autosave<string, unknown>(initial, {
    delayMs: REPLY_SAVE_DELAY_MS,
    send,
    // The newest text always wins; the answer adds nothing to it.
    merge: (latest) => latest,
    onChange: onChange && ((state) => onChange(state)),
  });
}
