// fixtures/seed/stems.json is the starter list every new shop gets (spec
// decisions 14 and 19). create_shop inserts it as is, so a bad row would fail
// every first sign-in. Zach edits the file; this test checks each row.

import { describe, expect, test } from "vitest";
import starter from "@/fixtures/seed/stems.json";

const KEYS = ["flower", "color", "isFiller", "unit", "bundleSize", "samplePrice", "sampleSource"];
const UNITS = ["dozen", "per10", "bundle", "bunch", "piece"];

const rows: Array<Record<string, unknown>> = starter;

describe("starter list", () => {
  test("is not empty", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  test.each(rows.map((row, index) => [`${index + 1} (${String(row.flower)} - ${String(row.color)})`, row]))(
    "row %s is valid",
    (_name, row) => {
      expect(Object.keys(row).sort()).toEqual([...KEYS].sort());
      expect(UNITS).toContain(row.unit);
      if (row.unit === "bundle") expect(row.bundleSize).toBeGreaterThan(0);
      else expect(row.bundleSize).toBeNull();
      expect(row.samplePrice).toBeTypeOf("number");
      expect(row.samplePrice as number).toBeGreaterThanOrEqual(0);
      expect(row.isFiller).toBeTypeOf("boolean");
      expect(row.sampleSource).toBeTypeOf("string");
      for (const field of ["flower", "color"]) {
        expect(row[field]).toBeTypeOf("string");
        expect(row[field]).not.toBe("");
        expect(row[field]).toBe((row[field] as string).trim());
      }
    },
  );

  test("has no two rows with the same name, ignoring capitals", () => {
    const names = rows.map((row) => `${String(row.flower)} - ${String(row.color)}`.toLowerCase());
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    expect(duplicates).toEqual([]);
  });
});
