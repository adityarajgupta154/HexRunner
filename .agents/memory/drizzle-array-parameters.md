---
name: Drizzle array parameters
description: A PostgreSQL parameter-encoding pitfall encountered in Drizzle raw SQL helpers.
---

Do not assume a JavaScript string array interpolated into a Drizzle `sql` template will arrive as a PostgreSQL array when explicitly cast with `::text[]`. For dynamic single-statement helpers, build parameterized scalar rows and operate on a `VALUES` table instead.

**Why:** A one-element array was serialized as a scalar string, causing PostgreSQL error `22P02` (“Array value must start with `{`”) even though the TypeScript value was an array.

**How to apply:** Use `sql.join` over individually parameterized scalar rows when constructing dynamic lock/query input. Keep values parameterized; never concatenate user-provided values into raw SQL.