#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.MCP_ENTITY_BASE_URL || "http://localhost:8080";
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
      "MCP_ENTITY_USER and MCP_ENTITY_PASSWORD must be set for authentication."
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
  if (cachedToken) {
    return cachedToken;
  }
  return login();
}

async function requestWithAuth(method, pathname, body, queryParams) {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const token = await getToken();
    const response = await fetch(buildUrl(pathname, queryParams), {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Auth": token,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
      data = parseJsonResponse(text);
    } catch (error) {
      const illegalToken = text?.toLowerCase().includes("illegal token");
      if (illegalToken) {
        cachedToken = null;
        if (attempt < maxAttempts) {
          continue;
        }
      }
      throw error;
    }

    if (response.status === 401 || response.status === 403) {
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
        description: "Create an entity type (table).",
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Table name (required).",
            },
            displayName: {
              type: "string",
              description: "Display name (optional). Defaults to tableName.",
            },
          },
          required: ["tableName"],
        },
      },
      {
        name: "add_field",
        description:
          "Add a field to an entity type. Use fieldType or specify lookupEntity/lookupField for lookups.",
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Target table name (required).",
            },
            fieldName: {
              type: "string",
              description: "Field name (required).",
            },
            fieldType: {
              type: "string",
              description:
                "Optional data type. One of: " +
                Array.from(FIELD_TYPES).join(", "),
            },
            displayName: {
              type: "string",
              description:
                "Display name (optional). Defaults to camelCaseToCaption(fieldName).",
            },
            lookupEntity: {
              type: "string",
              description: "Lookup entity name for AUTOCOMPLETE fields (optional).",
            },
            lookupField: {
              type: "string",
              description:
                "Lookup field name (optional). Defaults to lookup entity PK.",
            },
          },
          required: ["tableName", "fieldName"],
        },
      },
      {
        name: "list_tables",
        description: "List all entity types (tables).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      }, {
  name: "get_table",
  description: "Fetch an entity type by id or table name.",
  inputSchema: {
    type: "object",
    properties: {
      idOrName: {
        type: "string",
        description: "Table id or table name.",
      },
      tableName: {
        type: "string",
        description: "Table name.",
      },
    },
    additionalProperties: false,
    required: [],
  },
},
      {
        name: "create_rows",
        description: "Create one or more rows in an entity type.",
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Target table name (required).",
            },
            item: {
              type: "object",
              description: "Single row to insert (optional).",
            },
            items: {
              type: "array",
              items: { type: "object" },
              description: "Rows to insert in bulk (optional).",
            },
            returnFields: {
              type: "array",
              items: { type: "string" },
              description: "Optional list of fields to return.",
            },
          },
          required: ["tableName"],
        },
      },
      {
        name: "read_rows",
        description: "Read rows from an entity type with optional filtering.",
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Target table name (required).",
            },
            whereQuery: {
              type: "string",
              description: "Optional where query string.",
            },
            params: {
              type: "object",
              description: "Optional params map for whereQuery.",
            },
            filters: {
              type: "object",
              description: "Optional filters JSON.",
            },
            offset: {
              type: "integer",
              description: "Optional offset (default 0).",
            },
            limit: {
              type: "integer",
              description: "Optional limit (default 50, max 500).",
            },
            orderBy: {
              type: "string",
              description:
                "Optional orderBy string. You can pass JSON array as a string, for example: " +
                "[{\"field\":\"name\",\"direction\":\"asc\"}]",
            },
            includeTotal: {
              type: "boolean",
              description: "Optional includeTotal flag.",
            },
          },
          required: ["tableName"],
        },
      },
      {
        name: "update_rows",
        description: "Update one or more rows in an entity type.",
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Target table name (required).",
            },
            item: {
              type: "object",
              description: "Single row update (optional). Must include PK.",
            },
            items: {
              type: "array",
              items: { type: "object" },
              description: "Row updates in bulk (optional). Must include PK.",
            },
            returnFields: {
              type: "array",
              items: { type: "string" },
              description: "Optional list of fields to return.",
            },
          },
          required: ["tableName"],
        },
      },
      {
        name: "delete_rows",
        description: "Delete one or more rows in an entity type.",
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Target table name (required).",
            },
            item: {
              type: "object",
              description: "Single row delete (optional). Must include PK.",
            },
            items: {
              type: "array",
              items: { type: "object" },
              description: "Row deletes in bulk (optional). Must include PK.",
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

  if (name === "list_tables") {
    const data = await getWithAuth(ENTITY_PATH);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            data?.contents?.items ?? data?.contents ?? data,
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
