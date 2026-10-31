import { describe, expect, it } from "vitest";
import { csvToContactRows, parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("handles quoted fields containing commas", () => {
    expect(parseCsv('name,company\n"Doe, Jane","Acme, Inc."\n')).toEqual([
      ["name", "company"],
      ["Doe, Jane", "Acme, Inc."],
    ]);
  });

  it("skips blank lines and supports CRLF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("csvToContactRows", () => {
  it("maps header aliases and splits a full name", () => {
    const rows = csvToContactRows("First,Last,Email,Mobile\nJane,Doe,JANE@Example.com,(555) 123-4567");
    expect(rows).toEqual([
      {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "(555) 123-4567",
        company: "",
        source: "import",
      },
    ]);
  });

  it("falls back to a name column and skips rows without a first name", () => {
    const rows = csvToContactRows("name,email\nJane Doe,jane@example.com\n,orphan@example.com");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ firstName: "Jane", lastName: "Doe" });
  });
});
