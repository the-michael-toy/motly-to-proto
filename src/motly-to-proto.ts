import { parseTag } from "@malloydata/malloy-tag";

const PROTO_NUMERIC_TYPES = new Set([
  "int32",
  "int64",
  "uint32",
  "uint64",
  "sint32",
  "sint64",
  "fixed32",
  "fixed64",
  "sfixed32",
  "sfixed64",
  "float",
  "double",
]);

interface ProtoField {
  name: string;
  type: string;
  repeated: boolean;
  optional: boolean;
  fieldNumber: number;
}

interface ProtoEnum {
  name: string;
  values: string[];
}

interface ProtoMessage {
  name: string;
  fields: ProtoField[];
}

interface ConversionContext {
  typeAliases: Map<string, string>;
  customTypes: Record<string, unknown>;
  messages: ProtoMessage[];
  enums: ProtoEnum[];
  generatedMessages: Set<string>;
  generatedEnums: Set<string>;
  packageName?: string;
}

interface ConversionOptions {
  packageName?: string;
}

// Type helpers for safe property access
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecord(obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = obj[key];
  return isRecord(value) ? value : undefined;
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

function parseDirectives(content: string): { directives: Record<string, unknown>; rest: string } {
  const lines = content.split("\n");
  const directiveLines: string[] = [];
  let i = 0;

  while (i < lines.length && lines[i].startsWith("#!")) {
    directiveLines.push(lines[i].slice(2).trim());
    i++;
  }

  if (directiveLines.length === 0) {
    return { directives: {}, rest: content };
  }

  const directiveContent = directiveLines.join("\n");
  const { tag, log } = parseTag(directiveContent);
  if (log.length > 0) {
    throw new Error(`Directive parse errors: ${log.map((e) => e.message).join(", ")}`);
  }

  return {
    directives: tag.toObject(),
    rest: lines.slice(i).join("\n"),
  };
}

export function motlySchemaToProto(
  schemaContent: string,
  messageName: string,
  options: ConversionOptions = {}
): string {
  const { directives, rest } = parseDirectives(schemaContent);

  const { tag, log } = parseTag(rest);
  if (log.length > 0) {
    throw new Error(`Parse errors: ${log.map((e) => e.message).join(", ")}`);
  }
  const schema = tag.toObject();

  const packageName = options.packageName ?? getString(directives, "package");
  const types = getRecord(schema, "Types") || {};

  const typeAliases = buildTypeAliases(types);
  const context: ConversionContext = {
    typeAliases,
    customTypes: types,
    messages: [],
    enums: [],
    generatedMessages: new Set(),
    generatedEnums: new Set(),
    packageName,
  };

  const rootMessage = buildMessage(messageName, schema, context);
  context.messages.unshift(rootMessage);

  return generateProtoFile(context);
}

function buildTypeAliases(types: Record<string, unknown>): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const [name, value] of Object.entries(types)) {
    if (value === "number" && PROTO_NUMERIC_TYPES.has(name)) {
      aliases.set(name, name);
    }
  }
  return aliases;
}

function buildMessage(
  name: string,
  schema: Record<string, unknown>,
  context: ConversionContext
): ProtoMessage {
  const fields: ProtoField[] = [];
  let fieldNumber = 1;

  const required = getRecord(schema, "Required");
  if (required) {
    for (const [fieldName, fieldType] of Object.entries(required)) {
      const field = processField(
        fieldName,
        fieldType,
        false,
        fieldNumber++,
        name,
        context
      );
      fields.push(field);
    }
  }

  const optional = getRecord(schema, "Optional");
  if (optional) {
    for (const [fieldName, fieldType] of Object.entries(optional)) {
      const field = processField(
        fieldName,
        fieldType,
        true,
        fieldNumber++,
        name,
        context
      );
      fields.push(field);
    }
  }

  return { name, fields };
}

function processField(
  fieldName: string,
  fieldType: unknown,
  optional: boolean,
  fieldNumber: number,
  parentName: string,
  context: ConversionContext
): ProtoField {
  const { type, repeated } = resolveType(
    fieldType,
    fieldName,
    parentName,
    context
  );

  return {
    name: toSnakeCase(fieldName),
    type,
    repeated,
    optional,
    fieldNumber,
  };
}

function resolveType(
  fieldType: unknown,
  fieldName: string,
  parentName: string,
  context: ConversionContext
): { type: string; repeated: boolean } {
  // Inline enum definition [a, b, c]
  if (Array.isArray(fieldType)) {
    const enumName = parentName + toPascalCase(fieldName);
    if (!context.generatedEnums.has(enumName)) {
      context.generatedEnums.add(enumName);
      context.enums.push({
        name: enumName,
        values: fieldType.map(String),
      });
    }
    return { type: enumName, repeated: false };
  }

  if (typeof fieldType === "string") {
    // Array types: "string[]", "CustomType[]", etc.
    const arrayMatch = fieldType.match(/^(.+)\[\]$/);
    if (arrayMatch) {
      const innerType = arrayMatch[1];
      const resolved = resolveSingleType(innerType, fieldName, parentName, context);
      return { type: resolved, repeated: true };
    }

    return { type: resolveSingleType(fieldType, fieldName, parentName, context), repeated: false };
  }

  // Inline nested object
  if (isRecord(fieldType)) {
    const msgName = parentName + toPascalCase(fieldName);
    if (!context.generatedMessages.has(msgName)) {
      context.generatedMessages.add(msgName);
      const nestedMsg = buildMessage(msgName, fieldType, context);
      context.messages.push(nestedMsg);
    }
    return { type: msgName, repeated: false };
  }

  return { type: "string", repeated: false };
}

function resolveSingleType(
  typeName: string,
  fieldName: string,
  parentName: string,
  context: ConversionContext
): string {
  // Check type aliases first (int64 = number, etc.)
  if (context.typeAliases.has(typeName)) {
    return context.typeAliases.get(typeName)!;
  }

  // Check custom types
  const customDef = context.customTypes[typeName];
  if (customDef !== undefined) {
    // Enum type
    if (Array.isArray(customDef)) {
      const enumName = toPascalCase(typeName);
      if (!context.generatedEnums.has(enumName)) {
        context.generatedEnums.add(enumName);
        context.enums.push({
          name: enumName,
          values: customDef.map(String),
        });
      }
      return enumName;
    }

    // Object type (could be union or nested message)
    if (isRecord(customDef)) {
      // Union type (oneOf)
      const oneOf = customDef.oneOf;
      if (Array.isArray(oneOf)) {
        return "google.protobuf.Value";
      }

      // Nested message type
      const msgName = toPascalCase(typeName);
      if (!context.generatedMessages.has(msgName)) {
        context.generatedMessages.add(msgName);
        const nestedMsg = buildMessage(msgName, customDef, context);
        context.messages.push(nestedMsg);
      }
      return msgName;
    }
  }

  // Built-in scalar types
  switch (typeName) {
    case "string":
      return "string";
    case "number":
      return "double";
    case "boolean":
      return "bool";
    case "date":
      return "google.protobuf.Timestamp";
    case "tag":
      return "google.protobuf.Struct";
    case "flag":
      return "bool";
    case "any":
      return "google.protobuf.Value";
    default:
      return "string";
  }
}

function generateProtoFile(context: ConversionContext): string {
  const lines: string[] = [];

  lines.push('syntax = "proto3";');
  lines.push("");

  if (context.packageName) {
    lines.push(`package ${context.packageName};`);
    lines.push("");
  }

  const allFieldTypes = context.messages.flatMap((m) => m.fields.map((f) => f.type));
  const needsTimestamp = allFieldTypes.includes("google.protobuf.Timestamp");
  const needsStruct = allFieldTypes.some(
    (t) => t === "google.protobuf.Struct" || t === "google.protobuf.Value"
  );

  if (needsTimestamp) {
    lines.push('import "google/protobuf/timestamp.proto";');
  }
  if (needsStruct) {
    lines.push('import "google/protobuf/struct.proto";');
  }
  if (needsTimestamp || needsStruct) {
    lines.push("");
  }

  for (const enumDef of context.enums) {
    lines.push(`enum ${enumDef.name} {`);
    const prefix = toEnumPrefix(enumDef.name);
    lines.push(`  ${prefix}_UNSPECIFIED = 0;`);
    enumDef.values.forEach((value, index) => {
      const sanitized = toEnumValue(value);
      lines.push(`  ${prefix}_${sanitized} = ${index + 1};`);
    });
    lines.push("}");
    lines.push("");
  }

  for (const message of context.messages) {
    lines.push(`message ${message.name} {`);
    for (const field of message.fields) {
      const repeated = field.repeated ? "repeated " : "";
      const optional = field.optional && !field.repeated ? "optional " : "";
      lines.push(
        `  ${optional}${repeated}${field.type} ${field.name} = ${field.fieldNumber};`
      );
    }
    lines.push("}");
    lines.push("");
  }

  return lines.join("\n");
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function toEnumPrefix(enumName: string): string {
  return toSnakeCase(enumName).toUpperCase();
}

function toEnumValue(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}
