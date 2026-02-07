import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { motlySchemaToProto } from "./motly-to-proto.ts";

Deno.test("converts basic scalar types", () => {
  const schema = `
    Required: {
      name = string
      count = number
      active = boolean
    }
  `;
  const proto = motlySchemaToProto(schema, "Basic");

  assertStringIncludes(proto, 'syntax = "proto3";');
  assertStringIncludes(proto, "message Basic {");
  assertStringIncludes(proto, "string name = 1;");
  assertStringIncludes(proto, "double count = 2;");
  assertStringIncludes(proto, "bool active = 3;");
});

Deno.test("converts enum types", () => {
  const schema = `
    Types: {
      Status = [pending, active, completed]
    }
    Required: {
      status = Status
    }
  `;
  const proto = motlySchemaToProto(schema, "WithEnum");

  assertStringIncludes(proto, "enum Status {");
  assertStringIncludes(proto, "STATUS_UNSPECIFIED = 0;");
  assertStringIncludes(proto, "STATUS_PENDING = 1;");
  assertStringIncludes(proto, "Status status = 1;");
});

Deno.test("converts nested types to messages", () => {
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

  assertStringIncludes(proto, "message Address {");
  assertStringIncludes(proto, "string street = 1;");
  assertStringIncludes(proto, "Address address = 1;");
});

Deno.test("uses numeric type aliases", () => {
  const schema = `
    Types: {
      int64 = number
      int32 = number
    }
    Required: {
      id = int64
      count = int32
      ratio = number
    }
  `;
  const proto = motlySchemaToProto(schema, "WithNumericTypes");

  assertStringIncludes(proto, "int64 id = 1;");
  assertStringIncludes(proto, "int32 count = 2;");
  assertStringIncludes(proto, "double ratio = 3;");
});

Deno.test("parses package from directive", () => {
  const schema = `#! package = "myapp.v1"
    Required: {
      name = string
    }
  `;
  const proto = motlySchemaToProto(schema, "Test");

  assertStringIncludes(proto, "package myapp.v1;");
});
