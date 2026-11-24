#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.MCP_ENTITY_BASE_URL || "http://localhost:8080";
const API_KEY = process.env.MCP_ENTITY_API_KEY?.trim();
const USER = process.env.MCP_ENTITY_USER || "";
const PASSWORD = process.env.MCP_ENTITY_PASSWORD || "";

const ENTITY_PATH = "/json/v2/mcp/entities";
const LOGIN_PATH = "/json/login";

const FIELD_TYPES = new Set([
  "INTEGER",
  "DOUBLE",
  "BOOLEAN",
  "STRING",
  "DATETIME",
  "DATE",
  "TIME",
  "TEXT",
  "BIGINT",
]);

let cachedToken = null;

function buildUrl(pathname, queryParams) {
  const url = new URL(BASE_URL);
  url.pathname = pathname;
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      url.searchParams.set(key, value);
    });
  }
  return url.toString();
}

function requireValue(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required and must be a non-empty string.`);
  }
}

function parseJsonResponse(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const snippet = text.slice(0, 200);
    const err = new Error(`Invalid JSON response: ${snippet}`);
    err.rawText = text;
    throw err;
  }
}

function summarizeError(data) {
  if (!data) {
    return "empty response";
  }
  if (typeof data === "string") {
    return data;
  }
  if (data.message) {
    return data.message;
  }
  return JSON.stringify(data);
}

async function login() {
  if (!USER || !PASSWORD) {
    throw new Error(
      "MCP_ENTITY_API_KEY or both MCP_ENTITY_USER and MCP_ENTITY_PASSWORD must be set for authentication."
    );
  }

  const response = await fetch(buildUrl(LOGIN_PATH), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user: USER, password: PASSWORD }),
  });

  const text = await response.text();
  const data = parseJsonResponse(text);

  if (!response.ok) {
    throw new Error(
      `Login failed (${response.status}): ${summarizeError(data)}`
    );
  }

  const token = data?.token?.value;
  if (!token) {
    throw new Error("Login response missing token.value.");
  }

  cachedToken = token;
  return token;
}

async function getToken() {
  if (API_KEY) {
    return API_KEY;
  }
  if (cachedToken) {
    return cachedToken;
  }
  return login();
}

async function requestWithAuth(method, pathname, body, queryParams) {
  const maxAttempts = API_KEY ? 1 : 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const token = await getToken();
    const response = await fetch(buildUrl(pathname, queryParams), {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Auth": token,
      },
      body: body == null ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let data = null;
    try {
      data = parseJsonResponse(text);
    } catch (error) {
      const illegalToken = text?.toLowerCase().includes("illegal token");
      if (!API_KEY && illegalToken) {
        cachedToken = null;
        if (attempt < maxAttempts) {
          continue;
        }
      }
      throw error;
    }

    if (!API_KEY && (response.status === 401 || response.status === 403)) {
      cachedToken = null;
      if (attempt < maxAttempts) {
        continue;
      }
    }

    if (!response.ok) {
      const message =
        text && !data ? text : summarizeError(data);
      throw new Error(`Request failed (${response.status}): ${message}`);
    }

    return data;
  }

  throw new Error("Request failed after retrying authentication.");
}

async function postWithAuth(pathname, body) {
  return requestWithAuth("POST", pathname, body);
}

async function getWithAuth(pathname, queryParams) {
  return requestWithAuth("GET", pathname, null, queryParams);
}

const server = new Server(
  {
    name: "mcp-entity",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_table",
        description:
          "Create a new custom entity type (table) in the active workspace. Schema-mutating operation requiring administrative permissions. Newly created tables automatically include system columns such as `<tableName>id` (PK) and `displayname` (required when inserting rows). Check `list_tables` first to avoid duplicates; use `add_field` afterwards to add custom columns or lookups. Returns `{ entityType: { id, tableName, displayName, dataSourceType, workspaceId } }`.",
        annotations: {
          title: "Create Table",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Unique lowercase system name for the new table (e.g. `customer_feedback`). Required.",
            },
            displayName: {
              type: "string",
              description: "Human-readable table label (optional). Defaults to `tableName`.",
            },
          },
          required: ["tableName"],
        },
      },
      {
        name: "add_field",
        description:
          "Add a new column or lookup relationship to an existing table. Non-destructive schema mutation (existing rows receive null for the new field); requires administrative permissions. Specify either `fieldType` for a scalar column OR `lookupEntity` (and optional `lookupField`) for a foreign-key reference. Use `create_table` to create a new table, `get_table` to inspect existing fields, and `delete_field` to remove a field. Returns `{ field: { id, fieldName, displayName, fieldType, lookupEntity, lookupField } }`.",
        annotations: {
          title: "Add Field",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Target system table name (required).",
            },
            fieldName: {
              type: "string",
              description: "Unique system name for the new field (required).",
            },
            fieldType: {
              type: "string",
              description:
                "Scalar data type (omit when creating a lookup via `lookupEntity`). One of: " +
                Array.from(FIELD_TYPES).join(", "),
            },
            displayName: {
              type: "string",
              description:
                "Human-readable column label (optional). Defaults to `camelCaseToCaption(fieldName)`.",
            },
            lookupEntity: {
              type: "string",
              description: "Target entity `tableName` for a lookup/foreign-key field (optional; e.g. `interaction`).",
            },
            lookupField: {
              type: "string",
              description:
                "Referenced field on `lookupEntity` (optional). Defaults to the lookup entity's primary key.",
            },
          },
          required: ["tableName", "fieldName"],
        },
      },
      {
        name: "delete_field",
        description:
          "Permanently delete a non-key field from an entity type. Irreversible destructive schema mutation: removes the column definition and its stored values across all existing rows; requires administrative permissions. System/primary key fields cannot be deleted. Use `get_table` first to verify the field name, `add_field` to add columns, or `delete_rows` to delete records instead of columns. Returns confirmation of the deleted field.",
        annotations: {
          title: "Delete Field",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Target system table name (required).",
            },
            fieldName: {
              type: "string",
              description: "System name of the non-key field to permanently delete (required).",
            },
          },
          required: ["tableName", "fieldName"],
        },
      },
      {
        name: "list_tables",
        description:
          "List entity types (tables) accessible to the authenticated user (enforcing workspace permissions). Read-only. Omit both `offset` and `limit` to retrieve the full legacy list; provide `offset` and/or `limit` for paginated results. Returns `{ meta: { total, offset, limit, hasMore, returned }, items: [{ id, tableName, displayName, dataSourceType, workspaceId }] }` (or an array in legacy mode). Follow with `get_table` to inspect a table's columns.",
        annotations: {
          title: "List Tables",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: "object",
          properties: {
            offset: {
              type: "integer",
              minimum: 0,
              description: "Zero-based pagination offset (optional; defaults to 0 when pagination is enabled).",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 500,
              description: "Page size (optional; defaults to 50 when pagination is enabled, max 500).",
            },
          },
        },
      },
      {
        name: "get_table",
        description:
          "Fetch full metadata, primary key name, and column/field definitions for a single entity type. Read-only. Provide either `idOrName` (numeric table ID or system `tableName`) or `tableName`. Always call this before `create_rows`, `update_rows`, or `read_rows` to discover exact field names, data types, lookup targets, and required fields (such as `displayname`). Returns `{ entityType: {...}, fields: [...] }`.",
        annotations: {
          title: "Get Table Schema",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: "object",
          properties: {
            idOrName: {
              type: "string",
              description: "Numeric table ID or system `tableName` (provide either `idOrName` or `tableName`).",
            },
            tableName: {
              type: "string",
              description: "System `tableName` (alternative to `idOrName`).",
            },
          },
          additionalProperties: false,
          required: [],
        },
      },
      {
        name: "create_rows",
        description:
          "Insert one or multiple new records into an entity type. Mutates data, enforcing row/field permissions and workspace tariff limits. Pass `item` for a single record OR `items` for batch insertion (do not pass both). Custom tables typically require `displayname`—call `get_table` first to check required fields. Bulk inserts are non-atomic: each row is processed independently and the response returns `{ count, items: [{ status: 'ok', item }], errors: [{ status: 'error', index, message }] }`. Use `update_rows` to modify existing records.",
        annotations: {
          title: "Create Rows",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Target system table name (required).",
            },
            item: {
              type: "object",
              description: "Single row payload to insert (use either `item` or `items`, not both).",
            },
            items: {
              type: "array",
              items: { type: "object" },
              description: "Array of row payloads to insert in batch mode (use either `items` or `item`).",
            },
            returnFields: {
              type: "array",
              items: { type: "string" },
              description: "Optional list of field names to include in each returned `item`.",
            },
          },
          required: ["tableName"],
        },
      },
      {
        name: "read_rows",
        description:
          "Query records from an entity type with optional filtering, sorting, and pagination. Read-only; enforces Row-Level and Field-Level Security (RLS & FLS). Filtering options: use `whereQuery` (SQL-like condition, e.g. `rating >= 4`) with optional `params` bind map (`:paramName`), OR pass structured `filters` JSON (do not combine conflicting filters). Returns `{ meta: { offset, limit, returned, total? }, items: [...] }`. Call `get_table` first to verify filterable field names.",
        annotations: {
          title: "Read Rows",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Target system table name (required).",
            },
            whereQuery: {
              type: "string",
              description: "Optional SQL-like WHERE expression (e.g. `rating >= 4` or `status = :status`).",
            },
            params: {
              type: "object",
              description: "Optional key-value bind parameters for placeholders in `whereQuery`.",
            },
            filters: {
              type: "object",
              description: "Optional structured JSON filter object (alternative to `whereQuery`).",
            },
            offset: {
              type: "integer",
              description: "Zero-based pagination offset (optional, default 0).",
            },
            limit: {
              type: "integer",
              description: "Maximum rows to return (optional, default 50, max 500).",
            },
            orderBy: {
              type: "string",
              description:
                "Optional sort specification as a JSON array string, e.g. `[{\"field\":\"name\",\"direction\":\"asc\"}]`.",
            },
            includeTotal: {
              type: "boolean",
              description: "Optional flag to include total matching row count in `meta.total`.",
            },
          },
          required: ["tableName"],
        },
      },
      {
        name: "update_rows",
        description:
          "Partially update (patch) one or multiple existing records by primary key. Mutates data, enforcing RLS & FLS. Pass `item` for a single update OR `items` for batch updates (not both). Each object MUST include the table's primary key (`<tableName>id`) plus at least one field to update (only provided fields are modified). Bulk updates are non-atomic and return `{ count, items: [{ status: 'ok', item }], errors: [{ status: 'error', index, message }] }`. Use `create_rows` for new records or `delete_rows` to remove records.",
        annotations: {
          title: "Update Rows",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Target system table name (required).",
            },
            item: {
              type: "object",
              description: "Single row patch object (use either `item` or `items`). Must include PK and >=1 field to update.",
            },
            items: {
              type: "array",
              items: { type: "object" },
              description: "Array of row patch objects for batch update (use either `items` or `item`). Each must include PK.",
            },
            returnFields: {
              type: "array",
              items: { type: "string" },
              description: "Optional list of field names to include in each returned `item`.",
            },
          },
          required: ["tableName"],
        },
      },
      {
        name: "delete_rows",
        description:
          "Permanently delete one or multiple records by primary key. Irreversible destructive operation enforcing RLS permissions. Pass `item` for a single delete OR `items` for batch deletion (not both). Each object only needs the primary key field (e.g. `{ \"customer_feedbackid\": 1 }`; other fields are ignored). Bulk deletes are non-atomic and return `{ count, items: [{ status: 'ok', item }], errors: [{ status: 'error', index, message }] }`. Use `update_rows` to modify rows or `delete_field` to drop a column.",
        annotations: {
          title: "Delete Rows",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Target system table name (required).",
            },
            item: {
              type: "object",
              description: "Single row delete object containing the primary key (use either `item` or `items`).",
            },
            items: {
              type: "array",
              items: { type: "object" },
              description: "Array of row delete objects for batch deletion (use either `items` or `item`). Each must include PK.",
            },
          },
          required: ["tableName"],
        },
      },
    ],
  };
});

function encodeQueryValue(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "create_table") {
    requireValue(args?.tableName, "tableName");
    const payload = {
      tableName: args.tableName,
    };

    if (args?.displayName) {
      payload.displayName = args.displayName;
    }

    const data = await postWithAuth(ENTITY_PATH, payload);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data?.contents ?? data, null, 2),
        },
      ],
    };
  }

  if (name === "add_field") {
    requireValue(args?.tableName, "tableName");
    requireValue(args?.fieldName, "fieldName");

    if (args?.fieldType && !FIELD_TYPES.has(args.fieldType)) {
      throw new Error(
        `fieldType must be one of: ${Array.from(FIELD_TYPES).join(", ")}`
      );
    }

    if (args?.lookupField && !args?.lookupEntity) {
      throw new Error("lookupField requires lookupEntity.");
    }

    const payload = {
      fieldName: args.fieldName,
    };

    if (args?.fieldType) {
      payload.fieldType = args.fieldType;
    }

    if (args?.displayName) {
      payload.displayName = args.displayName;
    }

    if (args?.lookupEntity) {
      payload.lookupEntity = args.lookupEntity;
    }

    if (args?.lookupField) {
      payload.lookupField = args.lookupField;
    }

    const data = await postWithAuth(
      `${ENTITY_PATH}/${encodeURIComponent(args.tableName)}/fields`,
      payload
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data?.contents ?? data, null, 2),
        },
      ],
    };
  }

  if (name === "delete_field") {
    requireValue(args?.tableName, "tableName");
    requireValue(args?.fieldName, "fieldName");

    const data = await requestWithAuth(
      "DELETE",
      `${ENTITY_PATH}/${encodeURIComponent(args.tableName)}/fields/${encodeURIComponent(args.fieldName)}`
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data?.contents ?? data, null, 2),
        },
      ],
    };
  }

  if (name === "list_tables") {
    const paginated = args?.offset !== undefined || args?.limit !== undefined;
    if (args?.offset !== undefined && (!Number.isInteger(args.offset) || args.offset < 0)) {
      throw new Error("offset must be an integer >= 0.");
    }
    if (args?.limit !== undefined && (!Number.isInteger(args.limit) || args.limit <= 0 || args.limit > 500)) {
      throw new Error("limit must be an integer between 1 and 500.");
    }
    const data = await getWithAuth(ENTITY_PATH, {
      offset: args?.offset,
      limit: args?.limit,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            paginated ? (data?.contents ?? data) : (data?.contents?.items ?? data?.contents ?? data),
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "get_table") {
    const idOrName = args?.idOrName ?? args?.tableName;
    requireValue(idOrName, "idOrName");

    const data = await getWithAuth(
      `${ENTITY_PATH}/${encodeURIComponent(idOrName)}`
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data?.contents ?? data, null, 2),
        },
      ],
    };
  }

  if (name === "create_rows") {
    requireValue(args?.tableName, "tableName");

    if (args?.item && typeof args.item !== "object") {
      throw new Error("item must be an object when provided.");
    }

    if (args?.items && !Array.isArray(args.items)) {
      throw new Error("items must be an array when provided.");
    }

    if (!args?.item && !args?.items) {
      throw new Error("Either item or items must be provided.");
    }

    const payload = {};
    if (args?.item) {
      payload.item = args.item;
    }
    if (args?.items) {
      payload.items = args.items;
    }
    if (args?.returnFields) {
      payload.returnFields = args.returnFields;
    }

    const data = await postWithAuth(
      `${ENTITY_PATH}/${encodeURIComponent(args.tableName)}/rows`,
      payload
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data?.contents ?? data, null, 2),
        },
      ],
    };
  }

  if (name === "read_rows") {
    requireValue(args?.tableName, "tableName");

    const queryParams = {
      whereQuery: encodeQueryValue(args?.whereQuery),
      params: encodeQueryValue(args?.params),
      filters: encodeQueryValue(args?.filters),
      offset:
        typeof args?.offset === "number" ? String(args.offset) : undefined,
      limit: typeof args?.limit === "number" ? String(args.limit) : undefined,
      orderBy: encodeQueryValue(args?.orderBy),
      includeTotal:
        typeof args?.includeTotal === "boolean"
          ? String(args.includeTotal)
          : undefined,
    };

    const data = await getWithAuth(
      `${ENTITY_PATH}/${encodeURIComponent(args.tableName)}/rows`,
      queryParams
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data?.contents ?? data, null, 2),
        },
      ],
    };
  }

  if (name === "update_rows") {
    requireValue(args?.tableName, "tableName");

    if (args?.item && typeof args.item !== "object") {
      throw new Error("item must be an object when provided.");
    }

    if (args?.items && !Array.isArray(args.items)) {
      throw new Error("items must be an array when provided.");
    }

    if (!args?.item && !args?.items) {
      throw new Error("Either item or items must be provided.");
    }

    const payload = {};
    if (args?.item) {
      payload.item = args.item;
    }
    if (args?.items) {
      payload.items = args.items;
    }
    if (args?.returnFields) {
      payload.returnFields = args.returnFields;
    }

    const data = await postWithAuth(
      `${ENTITY_PATH}/${encodeURIComponent(args.tableName)}/rows/update`,
      payload
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data?.contents ?? data, null, 2),
        },
      ],
    };
  }

  if (name === "delete_rows") {
    requireValue(args?.tableName, "tableName");

    if (args?.item && typeof args.item !== "object") {
      throw new Error("item must be an object when provided.");
    }

    if (args?.items && !Array.isArray(args.items)) {
      throw new Error("items must be an array when provided.");
    }

    if (!args?.item && !args?.items) {
      throw new Error("Either item or items must be provided.");
    }

    const payload = {};
    if (args?.item) {
      payload.item = args.item;
    }
    if (args?.items) {
      payload.items = args.items;
    }

    const data = await postWithAuth(
      `${ENTITY_PATH}/${encodeURIComponent(args.tableName)}/rows/delete`,
      payload
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data?.contents ?? data, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
