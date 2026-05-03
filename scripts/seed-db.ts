import companies from "../seed/companies.json";

async function seed() {
  const values = companies
    .map((c) => {
      const id = crypto.randomUUID();
      const enabled = c.ats_type === "custom" ? 0 : 1;
      return `('${id}', '${c.name.replace(/'/g, "''")}', '${c.ats_type}', '${c.ats_slug}', '${c.website}', ${enabled})`;
    })
    .join(",\n  ");

  const sql = `INSERT OR IGNORE INTO companies (id, name, ats_type, ats_slug, website, enabled) VALUES\n  ${values};`;
  console.log(sql);
}

seed();
