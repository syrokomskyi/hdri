import {expect,test} from "vitest";
import fc from "fast-check";
import {scoreSelectionForPeriod} from "../score/score-core";

// The selection cutover is monotone across quarters: later years cannot restore legacy zero-filling.
test("all quarters after the cutover retain profile selection", () => {
  fc.assert(fc.property(fc.integer({min: 2027,max: 2099}),fc.integer({min: 1,max: 4}),(year,quarter)=>{
    expect(scoreSelectionForPeriod(`${year}-q${quarter}`)).toBe("reachable-profile-v1");
  }));
});
// Historical quarter selection is preserved independently of which pre-cutover year is reconstructed.
test("all quarters before the cutover retain historical selection", () => {
  fc.assert(fc.property(fc.integer({min: 2000,max: 2025}),fc.integer({min: 1,max: 4}),(year,quarter)=>{
    expect(scoreSelectionForPeriod(`${year}-q${quarter}`)).toBe("legacy");
  }));
});
