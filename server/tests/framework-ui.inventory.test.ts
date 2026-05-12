import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const BHV_IDS = [
  "BHV-051",
  "BHV-052",
  "BHV-053",
  "BHV-054",
  "BHV-055",
  "BHV-056",
  "BHV-057",
  "BHV-058",
  "BHV-059",
  "BHV-060",
] as const;

describe("Framework UI BHV inventory", () => {
  const rootDir = path.resolve(__dirname, "..");
  const reportPath = path.join(rootDir, "FRAMEWORK_UI_TEST_REPORT.md");
  const reportContent = readFileSync(reportPath, "utf8");

  for (const bhvId of BHV_IDS) {
    it(`${bhvId}: is included in framework report inventory`, () => {
      const anchor = `#${bhvId.toLowerCase()}`;
      expect(reportContent).toContain(`[${bhvId}](${anchor})`);
      expect(reportContent).toContain(`<a id="${bhvId.toLowerCase()}"></a>${bhvId}`);
    });

    it(`${bhvId}: has proof artifact in framework proofs folder`, () => {
      const proofPath = path.join(rootDir, "test-artifacts", "proofs", `${bhvId}-proof.png`);
      expect(existsSync(proofPath)).toBe(true);
    });
  }
});