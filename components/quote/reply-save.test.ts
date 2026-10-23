import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REPLY_SAVE_DELAY_MS, replySaver } from "./reply-save";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("replySaver (edited reply text → PATCH { replyText })", () => {
  it("waits for a pause in typing, then saves only the latest text", async () => {
    const send = vi.fn(async () => {});
    const saver = replySaver("Hi", send);
    saver.edit("Hi po");
    saver.edit("Hi po!");
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(REPLY_SAVE_DELAY_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("Hi po!");
    expect(saver.state()).toBe("saved");
  });
  it("saves at once on flush (leaving the screen, or before copying)", async () => {
    const send = vi.fn(async () => {});
    const saver = replySaver("Hi", send);
    saver.edit("Hello po");
    await saver.flush();
    expect(send).toHaveBeenCalledWith("Hello po");
  });
  it("sends nothing when nothing was edited", async () => {
    const send = vi.fn(async () => {});
    await replySaver("Hi", send).flush();
    expect(send).not.toHaveBeenCalled();
  });
});
