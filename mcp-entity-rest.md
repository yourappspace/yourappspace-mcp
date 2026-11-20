# MCP Entity REST: Update/Delete Rows (Node.js MCP)

Base path: /v2/mcp/entities
Content-Type: application/json
Note: DEV mode only.

## Update rows
POST /v2/mcp/entities/{tableName}/rows/update

Request body
- item: object (single update)
- items: array of objects (bulk update)
- returnFields: array of field names to include in response (optional)

Rules
- Each item must include the entity key field (PK) with a value.
- Only provided fields (excluding PK) are updated.
- If no fields besides PK are provided, the request fails with 400.
- For bulk: processing continues, per-item errors returned in `errors`.

Example (single)
```json
{
  "item": {
    "id": 123,
    "name": "New name",
    "status": "active"
  },
  "returnFields": ["name", "status"]
}
```

Example (bulk)
```json
{
  "items": [
    {"id": 101, "status": "active"},
    {"id": 102, "status": "disabled"}
  ]
}
```

Response (single/bulk)
```json
{
  "count": 2,
  "items": [
    {"status": "ok", "item": {"id": 101, "status": "active"}},
    {"status": "ok", "item": {"id": 102, "status": "disabled"}}
  ],
  "errors": [
    {"status": "error", "index": 3, "message": "Record with id='999' not found in table 'foo'"}
  ]
}
```

## Delete rows
POST /v2/mcp/entities/{tableName}/rows/delete

Request body
- item: object (single delete)
- items: array of objects (bulk delete)

Rules
- Each item must include the entity key field (PK) with a value.
- Only PK is required; other fields are ignored.
- For bulk: processing continues, per-item errors returned in `errors`.

Example (single)
```json
{
  "item": {"id": 123}
}
```

Example (bulk)
```json
{
  "items": [
    {"id": 101},
    {"id": 102}
  ]
}
```

Response (single/bulk)
```json
{
  "count": 2,
  "items": [
    {"status": "ok", "item": {"id": 101}},
    {"status": "ok", "item": {"id": 102}}
  ],
  "errors": [
    {"status": "error", "index": 1, "message": "Record with id='999' not found in table 'foo'"}
  ]
}
```

## Error behavior (common)
- 400: validation errors (missing PK, empty item, invalid fields)
- 404: entity/table or record not found
- 403: not in DEV mode
- 500: unexpected server error
