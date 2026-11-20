import { one, run } from "./db";
import { getEntityConfig, slugify, uniqueSlug, type AdminField } from "./admin";

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; status: number; message: string; fields?: Record<string, string> };

const FK_TABLES: Record<string, string> = {
  university_id: "universities",
  programme_id: "programmes",
  branch_id: "branches",
  category_id: "categories",
  college_id: "colleges",
};

const DEFAULTS: Record<string, Record<string, unknown>> = {
  categories: { sort_order: 0 },
  faqs: { category: "General", sort_order: 0, published: 1 },
  community_links: { platform: "Telegram", sort_order: 0, active: 1 },
  advertisements: { active: 1 },
  announcements: { tone: "info", active: 1 },
};

function emptyToNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/**
 * Validates and persists one admin-managed row using only the fields declared
 * for that entity. Unknown keys from the client are ignored.
 */
export function saveEntity(entitySlug: string, input: Record<string, unknown>, id?: string): SaveResult {
  const config = getEntityConfig(entitySlug);
  if (!config) return { ok: false, status: 404, message: "Unknown entity." };

  const fields = config.fields;
  const errors: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const field of fields) {
    const raw = input[field.name];
    if (field.type === "checkbox") {
      values[field.name] = raw === true || raw === 1 || raw === "1" || raw === "on" ? 1 : 0;
      continue;
    }

    if (field.type === "number") {
      if (raw === "" || raw === null || raw === undefined) {
        if (field.required) errors[field.name] = "This number is required.";
        else values[field.name] = DEFAULTS[config.table]?.[field.name] ?? null;
        continue;
      }
      const num = Number(raw);
      if (!Number.isInteger(num)) {
        errors[field.name] = "Enter a whole number.";
      } else if ((field.min !== undefined && num < field.min) || (field.max !== undefined && num > field.max)) {
        errors[field.name] = `Enter a value between ${field.min ?? 0} and ${field.max ?? "∞"}.`;
      } else {
        values[field.name] = num;
      }
      continue;
    }

    const text = emptyToNull(raw);
    if (!text) {
      if (field.required) {
        errors[field.name] = "This field is required.";
      } else {
        values[field.name] = DEFAULTS[config.table]?.[field.name] ?? null;
      }
      continue;
    }

    if (text.length > 20000) {
      errors[field.name] = "Keep this under 20,000 characters.";
      continue;
    }
    if (field.type === "url" && !/^https?:\/\/.+/i.test(text)) {
      errors[field.name] = "Enter a full URL starting with http:// or https://.";
      continue;
    }
    if (field.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) {
      errors[field.name] = "Enter a valid email address.";
      continue;
    }
    if (field.type === "select" && field.options && !field.options.some((option) => option.value === text)) {
      errors[field.name] = "Choose one of the listed options.";
      continue;
    }
    if (FK_TABLES[field.name]) {
      const exists = one<{ id: string }>(`SELECT id FROM ${FK_TABLES[field.name]} WHERE id = ?`, [text]);
      if (!exists) {
        errors[field.name] = "Choose a valid record.";
        continue;
      }
    }
    values[field.name] = text;
  }

  // Slugs are generated when the field is blank, and always de-duplicated.
  if (fields.some((field) => field.name === "slug")) {
    const explicit = emptyToNull(input.slug);
    const source = emptyToNull(config.slugSource ? input[config.slugSource] : null) ?? "item";
    if (!explicit && !slugify(source)) errors.slug = "Add a name to generate a slug.";
    else values.slug = uniqueSlug(config.table, explicit ?? source, id);
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, status: 422, message: "Please check the highlighted fields.", fields: errors };
  }

  try {
    if (id) {
      const exists = one<{ id: string }>(`SELECT id FROM ${config.table} WHERE id = ?`, [id]);
      if (!exists) return { ok: false, status: 404, message: "Record not found." };
      const assignments = Object.keys(values).map((key) => `${key} = ?`).join(", ");
      run(`UPDATE ${config.table} SET ${assignments} WHERE id = ?`, [...Object.values(values), id]);
      return { ok: true, id };
    }

    const newId = crypto.randomUUID().replace(/-/g, "").toLowerCase();
    const columns = Object.keys(values);
    run(
      `INSERT INTO ${config.table} (id${columns.length ? `, ${columns.join(", ")}` : ""})
       VALUES (?${columns.map(() => ", ?").join("")})`,
      [newId, ...Object.values(values)],
    );
    return { ok: true, id: newId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/UNIQUE constraint failed: .*\.slug/i.test(message)) {
      return { ok: false, status: 422, message: "That URL slug is already in use.", fields: { slug: "Already in use." } };
    }
    if (/UNIQUE constraint failed/i.test(message)) {
      return { ok: false, status: 422, message: "A record with that unique value already exists." };
    }
    if (/CHECK constraint failed/i.test(message)) {
      return { ok: false, status: 422, message: "A value is not allowed. Check status, type and level fields." };
    }
    if (/FOREIGN KEY constraint failed/i.test(message)) {
      return { ok: false, status: 422, message: "A linked record does not exist or is still in use." };
    }
    return { ok: false, status: 500, message: "The record could not be saved." };
  }
}

export function deleteEntity(entitySlug: string, id: string): SaveResult {
  const config = getEntityConfig(entitySlug);
  if (!config) return { ok: false, status: 404, message: "Unknown entity." };
  const exists = one<{ id: string }>(`SELECT id FROM ${config.table} WHERE id = ?`, [id]);
  if (!exists) return { ok: false, status: 404, message: "Record not found." };
  try {
    run(`DELETE FROM ${config.table} WHERE id = ?`, [id]);
    return { ok: true, id };
  } catch {
    return {
      ok: false,
      status: 409,
      message: "This record is still referenced by resources or subjects. Remove those first.",
    };
  }
}

export type { AdminField };
