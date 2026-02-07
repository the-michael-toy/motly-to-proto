import { describe, it } from "node:test";
import assert from "node:assert";
import { motlySchemaToProto } from "./motly-to-proto.js";

describe("motlySchemaToProto", () => {
  it("converts basic scalar types", () => {
    const schema = `
      Required: {
        name = string
        count = number
        active = boolean
      }
    `;
    const proto = motlySchemaToProto(schema, "Basic");

    assert(proto.includes('syntax = "proto3";'));
    assert(proto.includes("message Basic {"));
    assert(proto.includes("string name = 1;"));
    assert(proto.includes("double count = 2;"));
    assert(proto.includes("bool active = 3;"));
  });

  it("converts date to Timestamp", () => {
    const schema = `
      Required: {
        createdAt = date
      }
    `;
    const proto = motlySchemaToProto(schema, "WithDate");

    assert(proto.includes('import "google/protobuf/timestamp.proto";'));
    assert(proto.includes("google.protobuf.Timestamp created_at = 1;"));
  });

  it("converts optional fields", () => {
    const schema = `
      Optional: {
        nickname = string
        age = number
      }
    `;
    const proto = motlySchemaToProto(schema, "WithOptional");

    assert(proto.includes("optional string nickname = 1;"));
    assert(proto.includes("optional double age = 2;"));
  });

  it("converts array types to repeated", () => {
    const schema = `
      Required: {
        tags = "string[]"
        scores = "number[]"
      }
    `;
    const proto = motlySchemaToProto(schema, "WithArrays");

    assert(proto.includes("repeated string tags = 1;"));
    assert(proto.includes("repeated double scores = 2;"));
  });

  it("converts enum types", () => {
    const schema = `
      Types: {
        Status = [pending, active, completed]
      }
      Required: {
        status = Status
      }
    `;
    const proto = motlySchemaToProto(schema, "WithEnum");

    assert(proto.includes("enum Status {"));
    assert(proto.includes("STATUS_UNSPECIFIED = 0;"));
    assert(proto.includes("STATUS_PENDING = 1;"));
    assert(proto.includes("STATUS_ACTIVE = 2;"));
    assert(proto.includes("STATUS_COMPLETED = 3;"));
    assert(proto.includes("Status status = 1;"));
  });

  it("converts nested types to messages", () => {
    const schema = `
      Types: {
        Address: {
          Required: {
            street = string
            city = string
          }
        }
      }
      Required: {
        address = Address
      }
    `;
    const proto = motlySchemaToProto(schema, "WithNested");

    assert(proto.includes("message Address {"));
    assert(proto.includes("string street = 1;"));
    assert(proto.includes("string city = 2;"));
    assert(proto.includes("Address address = 1;"));
  });

  it("uses numeric type aliases", () => {
    const schema = `
      Types: {
        int64 = number
        int32 = number
        float = number
      }
      Required: {
        id = int64
        count = int32
        price = float
        ratio = number
      }
    `;
    const proto = motlySchemaToProto(schema, "WithNumericTypes");

    assert(proto.includes("int64 id = 1;"));
    assert(proto.includes("int32 count = 2;"));
    assert(proto.includes("float price = 3;"));
    assert(proto.includes("double ratio = 4;"));
  });

  it("converts any type to Value", () => {
    const schema = `
      Required: {
        metadata = any
      }
    `;
    const proto = motlySchemaToProto(schema, "WithAny");

    assert(proto.includes('import "google/protobuf/struct.proto";'));
    assert(proto.includes("google.protobuf.Value metadata = 1;"));
  });

  it("converts camelCase to snake_case", () => {
    const schema = `
      Required: {
        firstName = string
        lastName = string
        createdAt = date
      }
    `;
    const proto = motlySchemaToProto(schema, "WithCamelCase");

    assert(proto.includes("string first_name = 1;"));
    assert(proto.includes("string last_name = 2;"));
    assert(proto.includes("google.protobuf.Timestamp created_at = 3;"));
  });

  it("handles inline nested objects", () => {
    const schema = `
      Required: {
        config = tag {
          Required: {
            host = string
            port = number
          }
        }
      }
    `;
    const proto = motlySchemaToProto(schema, "WithInlineNested");

    assert(proto.includes("message WithInlineNestedConfig {"));
    assert(proto.includes("string host = 1;"));
    assert(proto.includes("double port = 2;"));
    assert(proto.includes("WithInlineNestedConfig config = 1;"));
  });

  it("handles arrays of custom types", () => {
    const schema = `
      Types: {
        Item: {
          Required: {
            name = string
            price = number
          }
        }
      }
      Required: {
        items = "Item[]"
      }
    `;
    const proto = motlySchemaToProto(schema, "WithCustomArray");

    assert(proto.includes("message Item {"));
    assert(proto.includes("repeated Item items = 1;"));
  });

  it("handles XMLParser style names (consecutive capitals)", () => {
    const schema = `
      Required: {
        XMLParser = string
        httpURL = string
      }
    `;
    const proto = motlySchemaToProto(schema, "Test");

    assert(proto.includes("string xml_parser = 1;"));
    assert(proto.includes("string http_url = 2;"));
  });

  it("handles hyphenated field names", () => {
    const schema = [
      "Required: {",
      "  `my-field` = string",
      "  `another-long-name` = number",
      "}",
    ].join("\n");
    const proto = motlySchemaToProto(schema, "Test");

    assert(proto.includes("string my_field = 1;"));
    assert(proto.includes("double another_long_name = 2;"));
  });

  it("sanitizes enum values with special characters", () => {
    const schema = `
      Types: {
        Status = ["in-progress", "not-started", "on-hold"]
      }
      Required: {
        status = Status
      }
    `;
    const proto = motlySchemaToProto(schema, "Test");

    assert(proto.includes("STATUS_IN_PROGRESS = 1;"));
    assert(proto.includes("STATUS_NOT_STARTED = 2;"));
    assert(proto.includes("STATUS_ON_HOLD = 3;"));
  });

  it("supports package name option", () => {
    const schema = `
      Required: {
        name = string
      }
    `;
    const proto = motlySchemaToProto(schema, "Test", { packageName: "myapp.v1" });

    assert(proto.includes("package myapp.v1;"));
  });

  it("parses package from #! directive", () => {
    const schema = `#! package = "myapp.v1"
      Required: {
        name = string
      }
    `;
    const proto = motlySchemaToProto(schema, "Test");

    assert(proto.includes("package myapp.v1;"));
  });

  it("command line option overrides directive", () => {
    const schema = `#! package = "directive.v1"
      Required: {
        name = string
      }
    `;
    const proto = motlySchemaToProto(schema, "Test", { packageName: "cmdline.v1" });

    assert(proto.includes("package cmdline.v1;"));
    assert(!proto.includes("directive.v1"));
  });

  it("handles multiple directive lines", () => {
    const schema = `#! package = "multi.v1"
#! someOther = value
      Required: {
        name = string
      }
    `;
    const proto = motlySchemaToProto(schema, "Test");

    assert(proto.includes("package multi.v1;"));
  });

  it("handles union types as Value", () => {
    const schema = `
      Types: {
        StringOrNumber: {
          oneOf = [string, number]
        }
      }
      Required: {
        value = StringOrNumber
      }
    `;
    const proto = motlySchemaToProto(schema, "Test");

    assert(proto.includes("google.protobuf.Value value = 1;"));
  });

  it("namespaces inline enums by parent message", () => {
    const schema = `
      Required: {
        status = [active, inactive]
      }
    `;
    const proto = motlySchemaToProto(schema, "User");

    assert(proto.includes("enum UserStatus {"));
    assert(proto.includes("UserStatus status = 1;"));
  });

  it("does not generate duplicate messages for repeated type references", () => {
    const schema = `
      Types: {
        Tag: {
          Required: { name = string }
        }
      }
      Required: {
        primaryTag = Tag
        secondaryTag = Tag
        allTags = "Tag[]"
      }
    `;
    const proto = motlySchemaToProto(schema, "Test");

    const matches = proto.match(/message Tag \{/g);
    assert.strictEqual(matches?.length, 1);
  });
});
