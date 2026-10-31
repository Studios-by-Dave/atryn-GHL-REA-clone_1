export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

const headerAliases: Record<string, string> = {
  first: "firstName",
  firstname: "firstName",
  "first name": "firstName",
  last: "lastName",
  lastname: "lastName",
  "last name": "lastName",
  name: "name",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  company: "company",
  organization: "company",
  business: "company",
  source: "source",
};

export type ImportedCsvRow = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  company: string;
  source: string;
};

export function csvToContactRows(input: string): ImportedCsvRow[] {
  const rows = parseCsv(input);
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map(
    (header) => headerAliases[header.trim().toLowerCase()] ?? header.trim(),
  );
  const hasHeader = headers.some((header) =>
    ["firstName", "lastName", "name", "email", "phone", "company", "source"].includes(header),
  );

  const body = hasHeader ? rows.slice(1) : rows;
  const indexOf = (name: string) => headers.indexOf(name);

  return body.flatMap((row) => {
    const read = (name: string): string => {
      const index = indexOf(name);
      return index === -1 ? "" : (row[index] ?? "").trim();
    };

    let firstName = read("firstName");
    let lastName = read("lastName");
    const fullName = read("name");
    if (!firstName && fullName) {
      const [first, ...rest] = fullName.split(/\s+/);
      firstName = first ?? "";
      lastName = rest.join(" ");
    }

    if (!firstName) {
      return [];
    }

    return [
      {
        firstName,
        lastName,
        email: read("email").toLowerCase() || null,
        phone: read("phone"),
        company: read("company"),
        source: read("source") || "import",
      },
    ];
  });
}
