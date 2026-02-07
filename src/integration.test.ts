import protobuf from "protobufjs";
import { motlySchemaToProto } from "./motly-to-proto.js";

describe("integration: roundtrip through protobuf", () => {
  it("creates, writes, reads, and verifies a message using all features", async () => {
    // Schema testing core features:
    // - Required and Optional fields
    // - Scalar types: string, number, boolean
    // - Numeric type aliases: int64, int32, float
    // - Arrays: string[], number[], custom[]
    // - Enums (named and inline)
    // - Nested messages (named and inline)
    // - Package directive
    //
    // Note: date/any/tag types are converted to string for this test
    // because protobufjs doesn't support google well-known types
    const schema = [
      '#! package = "test.v1"',
      "",
      "Types: {",
      "  int64 = number",
      "  int32 = number",
      "  float = number",
      "",
      "  Status = [pending, active, completed]",
      "",
      "  Address: {",
      "    Required: {",
      "      street = string",
      "      city = string",
      "    }",
      "    Optional: {",
      "      zipCode = string",
      "    }",
      "  }",
      "",
      "  Tag: {",
      "    Required: {",
      "      key = string",
      "      value = string",
      "    }",
      "  }",
      "}",
      "",
      "Required: {",
      "  id = int64",
      "  name = string",
      "  count = int32",
      "  price = float",
      "  ratio = number",
      "  active = boolean",
      "  status = Status",
      "  address = Address",
      "  priority = [low, medium, high]",
      "  inlineNested = tag {",
      "    Required: {",
      "      field1 = string",
      "      field2 = number",
      "    }",
      "  }",
      "}",
      "",
      "Optional: {",
      "  nickname = string",
      "  scores = \"number[]\"",
      "  tags = \"Tag[]\"",
      "  aliases = \"string[]\"",
      "}",
    ].join("\n");

    // Convert to proto
    const protoContent = motlySchemaToProto(schema, "TestMessage");

    // protobufjs doesn't support google well-known types out of the box,
    // so we'll create a simplified version without Timestamp/Value/Struct
    const simplifiedProto = protoContent
      .replace(/import "google\/protobuf\/timestamp\.proto";\n?/g, "")
      .replace(/import "google\/protobuf\/struct\.proto";\n?/g, "")
      .replace(/google\.protobuf\.Timestamp/g, "string")
      .replace(/google\.protobuf\.Value/g, "string")
      .replace(/google\.protobuf\.Struct/g, "string");

    // Parse the proto from string (no file needed)
    const root = protobuf.parse(simplifiedProto).root;
    const TestMessage = root.lookupType("test.v1.TestMessage");
    const Status = root.lookupEnum("test.v1.Status");
    const Priority = root.lookupEnum("test.v1.TestMessagePriority");

    // Create test data
    const testData = {
      id: 12345678901234,
      name: "Test User",
      count: 42,
      price: 19.99,
      ratio: 3.14159,
      active: true,
      status: Status.values["STATUS_ACTIVE"],
      address: {
        street: "123 Main St",
        city: "Testville",
        zipCode: "12345",
      },
      priority: Priority.values["TEST_MESSAGE_PRIORITY_HIGH"],
      inlineNested: {
        field1: "nested value",
        field2: 99.5,
      },
      nickname: "testy",
      scores: [95.5, 87.3, 91.0],
      tags: [
        { key: "env", value: "prod" },
        { key: "team", value: "backend" },
      ],
      aliases: ["alias1", "alias2", "alias3"],
    };

    // Verify the message is valid
    const errMsg = TestMessage.verify(testData);
    expect(errMsg).toBeNull();

    // Create, encode, decode
    const message = TestMessage.create(testData);
    const buffer = TestMessage.encode(message).finish();
    const decoded = TestMessage.decode(buffer);
    const decodedObj = TestMessage.toObject(decoded, {
      longs: Number,
      enums: Number,
      defaults: true,
    });

    // Verify all fields roundtrip correctly
    expect(decodedObj.id).toBe(testData.id);
    expect(decodedObj.name).toBe(testData.name);
    expect(decodedObj.count).toBe(testData.count);
    expect(decodedObj.price).toBeCloseTo(testData.price, 2);
    expect(decodedObj.ratio).toBeCloseTo(testData.ratio, 5);
    expect(decodedObj.active).toBe(testData.active);
    expect(decodedObj.status).toBe(testData.status);
    expect(decodedObj.address.street).toBe(testData.address.street);
    expect(decodedObj.address.city).toBe(testData.address.city);
    expect(decodedObj.address.zipCode).toBe(testData.address.zipCode);
    expect(decodedObj.priority).toBe(testData.priority);
    expect(decodedObj.inlineNested.field1).toBe(testData.inlineNested.field1);
    expect(decodedObj.inlineNested.field2).toBeCloseTo(testData.inlineNested.field2, 1);
    expect(decodedObj.nickname).toBe(testData.nickname);
    expect(decodedObj.scores).toHaveLength(3);
    expect(decodedObj.scores[0]).toBeCloseTo(95.5, 1);
    expect(decodedObj.tags).toHaveLength(2);
    expect(decodedObj.tags[0].key).toBe("env");
    expect(decodedObj.tags[1].value).toBe("backend");
    expect(decodedObj.aliases).toEqual(["alias1", "alias2", "alias3"]);
  });
});
