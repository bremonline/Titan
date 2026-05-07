import { describe, expect, it } from "vitest";

import { getValidDestinations } from "../src/game/movementRules.js";

describe("getValidDestinations", () => {
  it("returns configured destinations for known tile and roll", () => {
    expect(getValidDestinations("100", 1)).toEqual(["312", "314", "414"]);
  });

  it("returns empty array for invalid die rolls", () => {
    expect(getValidDestinations("100", 0)).toEqual([]);
    expect(getValidDestinations("100", -1)).toEqual([]);
    expect(getValidDestinations("100", 1.5)).toEqual([]);
  });

  it("returns empty array when no rule exists", () => {
    expect(getValidDestinations("999", 3)).toEqual([]);
  });
});
