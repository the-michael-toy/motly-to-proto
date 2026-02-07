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

    expect(proto).toContain('syntax = "proto3";');
    expect(proto).toContain("message Basic {");
    expect(proto).toContain("string name = 1;");
    expect(proto).toContain("double count = 2;");
    expect(proto).toContain("bool active = 3;");
  });

  it("converts date to Timestamp", () => {
    const schema = `
      Required: {
        createdAt = date
      }
    `;
    const proto = motlySchemaToProto(schema, "WithDate");

    expect(proto).toContain('import "google/protobuf/timestamp.proto";');
    expect(proto).toContain("google.protobuf.Timestamp created_at = 1;");
  });

  it("converts optional fields", () => {
    const schema = `
      Optional: {
        nickname = string
        age = number
      }
    `;
    const proto = motlySchemaToProto(schema, "WithOptional");

    expect(proto).toContain("optional string nickname = 1;");
    expect(proto).toContain("optional double age = 2;");
  });

  it("converts array types to repeated", () => {
    const schema = `
      Required: {
        tags = "string[]"
        scores = "number[]"
      }
    `;
    const proto = motlySchemaToProto(schema, "WithArrays");

    expect(proto).toContain("repeated string tags = 1;");
    expect(proto).toContain("repeated double scores = 2;");
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

    expect(proto).toContain("enum Status {");
    expect(proto).toContain("STATUS_UNSPECIFIED = 0;");
    expect(proto).toContain("STATUS_PENDING = 1;");
    expect(proto).toContain("STATUS_ACTIVE = 2;");
    expect(proto).toContain("STATUS_COMPLETED = 3;");
    expect(proto).toContain("Status status = 1;");
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

    expect(proto).toContain("message Address {");
    expect(proto).toContain("string street = 1;");
    expect(proto).toContain("string city = 2;");
    expect(proto).toContain("Address address = 1;");
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

    expect(proto).toContain("int64 id = 1;");
    expect(proto).toContain("int32 count = 2;");
    expect(proto).toContain("float price = 3;");
    expect(proto).toContain("double ratio = 4;");
  });

  it("converts any type to Value", () => {
    const schema = `
      Required: {
        metadata = any
      }
    `;
    const proto = motlySchemaToProto(schema, "WithAny");

    expect(proto).toContain('import "google/protobuf/struct.proto";');
    expect(proto).toContain("google.protobuf.Value metadata = 1;");
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

    expect(proto).toContain("string first_name = 1;");
    expect(proto).toContain("string last_name = 2;");
    expect(proto).toContain("google.protobuf.Timestamp created_at = 3;");
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

    expect(proto).toContain("message WithInlineNestedConfig {");
    expect(proto).toContain("string host = 1;");
    expect(proto).toContain("double port = 2;");
    expect(proto).toContain("WithInlineNestedConfig config = 1;");
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

    expect(proto).toContain("message Item {");
    expect(proto).toContain("repeated Item items = 1;");
  });

  it("handles XMLParser style names (consecutive capitals)", () => {
    const schema = `
      Required: {
        XMLParser = string
        httpURL = string
      }
    `;
    const proto = motlySchemaToProto(schema, "Test");

    expect(proto).toContain("string xml_parser = 1;");
    expect(proto).toContain("string http_url = 2;");
  });

  it("handles hyphenated field names", () => {
    const schema = [
      "Required: {",
      "  `my-field` = string",
      "  `another-long-name` = number",
      "}",
    ].join("\n");
    const proto = motlySchemaToProto(schema, "Test");

    expect(proto).toContain("string my_field = 1;");
    expect(proto).toContain("double another_long_name = 2;");
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

    expect(proto).toContain("STATUS_IN_PROGRESS = 1;");
    expect(proto).toContain("STATUS_NOT_STARTED = 2;");
    expect(proto).toContain("STATUS_ON_HOLD = 3;");
  });

  it("supports package name option", () => {
    const schema = `
      Required: {
        name = string
      }
    `;
    const proto = motlySchemaToProto(schema, "Test", { packageName: "myapp.v1" });

    expect(proto).toContain("package myapp.v1;");
  });

  it("parses package from #! directive", () => {
    const schema = `#! package = "myapp.v1"
      Required: {
        name = string
      }
    `;
    const proto = motlySchemaToProto(schema, "Test");

    expect(proto).toContain("package myapp.v1;");
  });

  it("command line option overrides directive", () => {
    const schema = `#! package = "directive.v1"
      Required: {
        name = string
      }
    `;
    const proto = motlySchemaToProto(schema, "Test", { packageName: "cmdline.v1" });

    expect(proto).toContain("package cmdline.v1;");
    expect(proto).not.toContain("directive.v1");
  });

  it("handles multiple directive lines", () => {
    const schema = `#! package = "multi.v1"
#! someOther = value
      Required: {
        name = string
      }
    `;
    const proto = motlySchemaToProto(schema, "Test");

    expect(proto).toContain("package multi.v1;");
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

    expect(proto).toContain("google.protobuf.Value value = 1;");
  });

  it("namespaces inline enums by parent message", () => {
    const schema = `
      Required: {
        status = [active, inactive]
      }
    `;
    const proto = motlySchemaToProto(schema, "User");

    expect(proto).toContain("enum UserStatus {");
    expect(proto).toContain("UserStatus status = 1;");
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

    // Should only have one "message Tag" definition
    const matches = proto.match(/message Tag \{/g);
    expect(matches).toHaveLength(1);
  });
});
