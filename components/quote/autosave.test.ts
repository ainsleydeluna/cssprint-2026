import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosave } from "./autosave";

// Lines as the quote editor keeps them: a new line has no id until a save answers with one.
type Line = { key: string; id?: string; count: number };

/** A fake lines route: each call waits until the test resolves it, then gives new lines ids. */
function fakeRoute() {
  const calls: { sent: Line[]; resolve: () => void; reject: () => void }[] = [];
  let nextId = 1;
  const send = vi.fn(
    (sent: Line[]) =>
      new Promise<Line[]>((resolve, reject) => {
        calls.push({
          sent,
          resolve: () => resolve(sent.map((l) => ({ ...l, id: l.id ?? `id-${nextId++}` }))),
          reject: () => reject(new Error("500")),
        });
      }),
  );
  return { calls, send };
}

// New lines take the ids the answer gave them, matched by key; everything else stays as edited.
const merge = (latest: Line[], sent: Line[], answer: Line[]) => {
  const ids = new Map(sent.map((l, i) => [l.key, answer[i].id]));
  return latest.map((l) => ({ ...l, id: l.id ?? ids.get(l.key) }));
};

const settle = () => vi.advanceTimersByTimeAsync(0);

describe("Autosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for the debounce and sends only the newest lines", async () => {
    const route = fakeRoute();
    const save = new Autosave<Line[], Line[]>([], { delayMs: 600, send: route.send, merge });
    save.edit([{ key: "a", id: "1", count: 1 }]);
    save.edit([{ key: "a", id: "1", count: 2 }]);
    await vi.advanceTimersByTimeAsync(599);
    expect(route.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(route.send).toHaveBeenCalledTimes(1);
    expect(route.calls[0].sent).toEqual([{ key: "a", id: "1", count: 2 }]);
  });

  it("never has two saves in flight, and sends the newest lines once the first finishes", async () => {
    const route = fakeRoute();
    const save = new Autosave<Line[], Line[]>([], { delayMs: 600, send: route.send, merge });
    save.edit([{ key: "new", count: 1 }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(route.send).toHaveBeenCalledTimes(1);

    // Two more edits while the first save is running, each past the debounce.
    save.edit([{ key: "new", count: 2 }]);
    await vi.advanceTimersByTimeAsync(600);
    save.edit([{ key: "new", count: 3 }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(route.send).toHaveBeenCalledTimes(1);

    route.calls[0].resolve();
    await settle();
    expect(route.send).toHaveBeenCalledTimes(2);
    // The second save carries the id from the first answer and the newest count: the line isn't created twice.
    expect(route.calls[1].sent).toEqual([{ key: "new", id: "id-1", count: 3 }]);
  });

  it("flush() during a running save waits for it instead of sending alongside it (leaving the page)", async () => {
    const route = fakeRoute();
    const save = new Autosave<Line[], Line[]>([], { delayMs: 600, send: route.send, merge });
    save.edit([{ key: "new", count: 1 }]);
    await vi.advanceTimersByTimeAsync(600);
    save.edit([{ key: "new", count: 5 }]);
    void save.flush();
    await settle();
    expect(route.send).toHaveBeenCalledTimes(1);

    route.calls[0].resolve();
    await settle();
    expect(route.send).toHaveBeenCalledTimes(2);
    expect(route.calls[1].sent).toEqual([{ key: "new", id: "id-1", count: 5 }]);
  });

  it("sends nothing more when nothing changed during a save", async () => {
    const route = fakeRoute();
    const states: string[] = [];
    const save = new Autosave<Line[], Line[]>([], { delayMs: 600, send: route.send, merge, onChange: (s) => states.push(s) });
    save.edit([{ key: "a", count: 1 }]);
    await vi.advanceTimersByTimeAsync(600);
    route.calls[0].resolve();
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(route.send).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toBe("saved");
    expect(save.value).toEqual([{ key: "a", id: "id-1", count: 1 }]);
  });

  it("after a failed save, keeps the newest lines and sends them on retry", async () => {
    const route = fakeRoute();
    const states: string[] = [];
    const save = new Autosave<Line[], Line[]>([], { delayMs: 600, send: route.send, merge, onChange: (s) => states.push(s) });
    save.edit([{ key: "new", count: 1 }]);
    await vi.advanceTimersByTimeAsync(600);
    route.calls[0].reject();
    await settle();
    expect(states.at(-1)).toBe("failed");

    void save.flush();
    await settle();
    expect(route.send).toHaveBeenCalledTimes(2);
    expect(route.calls[1].sent).toEqual([{ key: "new", count: 1 }]);
  });
});
