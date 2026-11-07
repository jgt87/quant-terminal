import { beforeEach, describe, expect, it } from "vitest";
import { resetNotices, showNotices } from "../src/api/notices";
import { subscribeToasts, type Toast } from "../src/panels/common/toasts";

describe("provider notices", () => {
  beforeEach(() => resetNotices());

  it("shows each notice once as an info toast", () => {
    let list: Toast[] = [];
    const off = subscribeToasts((l) => (list = l));
    expect(showNotices(["Deriv only keeps about one year of history.", "Deriv data has no volume."])).toHaveLength(2);
    expect(showNotices(["Deriv data has no volume.", "New one"])).toEqual(["New one"]);
    expect(showNotices(undefined)).toEqual([]);
    expect(list.map((t) => [t.title, t.body, t.tone])).toEqual([
      ["Data limit", "New one", "info"],
      ["Data limit", "Deriv data has no volume.", "info"],
      ["Data limit", "Deriv only keeps about one year of history.", "info"],
    ]);
    off();
  });
});
