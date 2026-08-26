import { describe, it, expect } from "vitest";
import { FREE_LIMITS, PRO_LIMITS, limitMessage } from "../src/limits";

describe("FREE_LIMITS / PRO_LIMITS", () => {
  it("free tiene límites numéricos", () => {
    expect(FREE_LIMITS.maxContacts).toBe(50);
    expect(FREE_LIMITS.maxMessagesPerMonth).toBe(500);
    expect(FREE_LIMITS.maxChannels).toBe(2);
    expect(FREE_LIMITS.maxRules).toBe(5);
    expect(FREE_LIMITS.maxAutoDmsPerMonth).toBe(100);
    expect(FREE_LIMITS.maxTrackedLinks).toBe(3);
  });

  it("pro no tiene límites (null)", () => {
    expect(PRO_LIMITS.maxContacts).toBeNull();
    expect(PRO_LIMITS.maxMessagesPerMonth).toBeNull();
    expect(PRO_LIMITS.maxChannels).toBeNull();
    expect(PRO_LIMITS.maxRules).toBeNull();
  });

  it("limitMessage es amable y menciona el panel", () => {
    const msg = limitMessage("contacts", 50, 50);
    expect(msg).toContain("50/50");
    expect(msg.toLowerCase()).toContain("límite");
    expect(msg).toContain("Pro");
  });
});
