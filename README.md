# motly-to-proto

Convert [MOTLY](https://github.com/malloydata/malloy/blob/main/packages/malloy-tag/docs/motly.md) schema definitions to Protocol Buffer (proto3) format.

> **Note:** This is a proof of concept demonstrating the feasibility of the conversion. It has not yet been used in production.

## Usage

### Node.js

```bash
npm install
npm run build
node dist/cli.js <schema.motly> [MessageName] [--package <name>]
```

### Deno

```bash
deno run --allow-read src/cli-deno.ts <schema.motly> [MessageName] [--package <name>]
```

### Directives

Proto options can be specified at the top of the schema file using `#!` directives:

```motly
#! package = "myapp.v1"

Required: {
  name = string
}
```

Available directives:
- `package` - Sets the proto package name

Command line options override directives.

## Type Mapping

| MOTLY | Proto3 |
|-------|--------|
| `string` | `string` |
| `number` | `double` |
| `boolean` | `bool` |
| `date` | `google.protobuf.Timestamp` |
| `tag` | nested `message` |
| `flag` | `bool` |
| `any` | `google.protobuf.Value` |
| `"type[]"` | `repeated type` |
| `[a, b, c]` | `enum` |

### Numeric Type Precision

By default, `number` maps to `double`. To use a specific protobuf numeric type, define a type alias with a matching name:

```motly
Types: {
  int64 = number
  int32 = number
  float = number
}
Required: {
  id = int64       # becomes: int64 id = 1;
  count = int32    # becomes: int32 count = 2;
  price = float    # becomes: float price = 3;
  ratio = number   # becomes: double ratio = 4;
}
```

Recognized numeric types: `int32`, `int64`, `uint32`, `uint64`, `sint32`, `sint64`, `fixed32`, `fixed64`, `sfixed32`, `sfixed64`, `float`, `double`

## Example

**Input:** `example.motly`

```motly
#! package = "example.v1"

Types: {
  int64 = number
  Status = [pending, active, completed]
  Address: {
    Required: { street = string, city = string }
    Optional: { zipCode = string }
  }
}

Required: {
  id = int64
  name = string
  createdAt = date
  status = Status
  address = Address
}

Optional: {
  tags = "string[]"
  isVerified = boolean
}
```

**Output:**

```protobuf
syntax = "proto3";

package example.v1;

import "google/protobuf/timestamp.proto";

enum Status {
  STATUS_UNSPECIFIED = 0;
  STATUS_PENDING = 1;
  STATUS_ACTIVE = 2;
  STATUS_COMPLETED = 3;
}

message Example {
  int64 id = 1;
  string name = 2;
  google.protobuf.Timestamp created_at = 3;
  Status status = 4;
  Address address = 5;
  repeated string tags = 6;
  optional bool is_verified = 7;
}

message Address {
  string street = 1;
  string city = 2;
  optional string zip_code = 3;
}
```

## Conversion Rules

- `Required` fields become regular proto3 fields
- `Optional` fields use the `optional` keyword
- Field names are converted to snake_case
- Message and enum names are converted to PascalCase
- Enums include an `UNSPECIFIED = 0` value per proto3 convention
- Custom types defined in `Types` become separate messages or enums

## Dependencies

- [@malloydata/malloy-tag](https://github.com/malloydata/malloy/tree/main/packages/malloy-tag) - MOTLY parser
