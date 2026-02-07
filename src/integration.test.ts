import { describe, it } from "node:test";
import assert from "node:assert";
import protobuf from "protobufjs";
import { motlySchemaToProto } from "./motly-to-proto.js";

describe("integration: roundtrip through protobuf", () => {
  it("creates, writes, reads, and verifies a message using all features", () => {
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
      '  scores = "number[]"',
      '  tags = "Tag[]"',
      '  aliases = "string[]"',
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
    assert.strictEqual(errMsg, null);

    // Create, encode, decode
    const message = TestMessage.create(testData);
    const buffer = TestMessage.encode(message).finish();
    const decoded = TestMessage.decode(buffer);
    const decodedObj = TestMessage.toObject(decoded, {
      longs: Number,
      enums: Number,
      defaults: true,
    }) as Record<string, unknown>;

    // Verify all fields roundtrip correctly
    assert.strictEqual(decodedObj.id, testData.id);
    assert.strictEqual(decodedObj.name, testData.name);
    assert.strictEqual(decodedObj.count, testData.count);
    assert(Math.abs((decodedObj.price as number) - testData.price) < 0.01);
    assert(Math.abs((decodedObj.ratio as number) - testData.ratio) < 0.00001);
    assert.strictEqual(decodedObj.active, testData.active);
    assert.strictEqual(decodedObj.status, testData.status);

    const address = decodedObj.address as Record<string, unknown>;
    assert.strictEqual(address.street, testData.address.street);
    assert.strictEqual(address.city, testData.address.city);
    assert.strictEqual(address.zipCode, testData.address.zipCode);

    assert.strictEqual(decodedObj.priority, testData.priority);

    const inlineNested = decodedObj.inlineNested as Record<string, unknown>;
    assert.strictEqual(inlineNested.field1, testData.inlineNested.field1);
    assert(Math.abs((inlineNested.field2 as number) - testData.inlineNested.field2) < 0.1);

    assert.strictEqual(decodedObj.nickname, testData.nickname);

    const scores = decodedObj.scores as number[];
    assert.strictEqual(scores.length, 3);
    assert(Math.abs(scores[0] - 95.5) < 0.1);

    const tags = decodedObj.tags as Array<Record<string, unknown>>;
    assert.strictEqual(tags.length, 2);
    assert.strictEqual(tags[0].key, "env");
    assert.strictEqual(tags[1].value, "backend");

    assert.deepStrictEqual(decodedObj.aliases, ["alias1", "alias2", "alias3"]);
  });
});
