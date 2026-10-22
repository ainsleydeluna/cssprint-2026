// Debounced autosave with at most one save in flight. Edits made while a save runs are
// remembered and sent once it finishes, after its answer has been folded in (so a new line
// gets its id before the next save, and is never created twice). No React here: autosave.test.ts.

export type SaveState = "saved" | "pending" | "saving" | "failed";

type Options<T, R> = {
  delayMs: number;
  send: (value: T) => Promise<R>;
  /** Folds an answer into the newest value; `sent` is what that save sent. Its result is what the next save sends. */
  merge: (latest: T, sent: T, answer: R) => T;
  /** Called on every state change, with the newest value. */
  onChange?: (state: SaveState, value: T) => void;
};

export class Autosave<T, R> {
  private latest: T;
  private dirty = false;
  private failed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;

  constructor(
    initial: T,
    private readonly options: Options<T, R>,
  ) {
    this.latest = initial;
  }

  /** The newest value, with every answer so far folded in. */
  get value(): T {
    return this.latest;
  }

  edit(value: T) {
    this.latest = value;
    this.dirty = true;
    this.failed = false;
    this.emit();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.options.delayMs);
  }

  /** Saves now (after leaving the page, or on retry). If a save is running, the newest value follows it; nothing runs alongside. */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.failed) {
      this.failed = false;
      this.dirty = true;
    }
    if (!this.running && this.dirty) {
      this.running = this.loop().finally(() => {
        this.running = null;
        this.emit();
      });
    }
    return this.running ?? Promise.resolve();
  }

  private async loop() {
    while (this.dirty && !this.timer) {
      this.dirty = false;
      const sent = this.latest;
      this.emit("saving");
      try {
        const answer = await this.options.send(sent);
        this.latest = this.options.merge(this.latest, sent, answer);
      } catch {
        this.dirty = true;
        this.failed = true;
        return;
      }
    }
  }

  private emit(state = this.state()) {
    this.options.onChange?.(state, this.latest);
  }

  private state(): SaveState {
    if (this.failed) return "failed";
    if (this.running) return "saving";
    return this.dirty ? "pending" : "saved";
  }
}
