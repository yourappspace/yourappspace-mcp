---
name: yourappspace-backend
description: Design data models, lookup relationships, and run filtered CRUD queries against YourAppSpace Core via the dev-entity MCP server.
---

# YourAppSpace Core Backend Workflow

Use this skill when designing backend tables, adding columns or lookups, seeding records, or running filtered/aggregated queries on YourAppSpace Core through the `dev-entity` MCP server.

## Prerequisites
- Configure the `dev-entity` MCP server (`npx -y @yourappspace/mcp-server`) with `MCP_ENTITY_API_KEY`.
- Verify authentication by calling `list_tables` with `{"offset": 0, "limit": 1}`.

## Standard Workflow
1. **Discover existing tables:** Call `list_tables` and `get_table` to inspect existing entities (such as built-in `interaction`) and required columns.
2. **Create or evolve schema:**
   - Call `create_table` with a lowercase `tableName` and human-readable `displayName`.
   - Call `add_field` for each column (`TEXT`, `STRING`, `INTEGER`, `DOUBLE`, `BOOLEAN`, `DATE`, `DATETIME`, `BIGINT`) or lookup (`lookupEntity`).
3. **Insert & update records:**
   - Include `displayname` on custom tables when calling `create_rows`.
   - Include `<tableName>id` when calling `update_rows` or `delete_rows`.
   - Check `errors` in bulk responses for validation or demo-tier tariff limits.
4. **Query & aggregate:**
   - Call `read_rows` with `whereQuery`, `params`, `orderBy`, `limit`, and `includeTotal: true`, then compute counts, averages, or groupings from the returned rows.
