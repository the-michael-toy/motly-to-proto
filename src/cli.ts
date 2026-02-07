#!/usr/bin/env node

import * as fs from "fs";
import { motlySchemaToProto } from "./motly-to-proto.js";

function main() {
  const args = process.argv.slice(2);
  const { positional, options } = parseArgs(args);

  if (positional.length < 1 || options.help) {
    console.error("Usage: motly-to-proto <schema.motly> [MessageName] [options]");
    console.error("");
    console.error("Converts a MOTLY schema file to Protocol Buffers format.");
    console.error("");
    console.error("Options:");
    console.error("  --package <name>  Set the proto package name");
    console.error("  --help            Show this help message");
    process.exit(options.help ? 0 : 1);
  }

  const schemaPath = positional[0];
  const messageName = positional[1] || deriveMessageName(schemaPath);

  if (!fs.existsSync(schemaPath)) {
    console.error(`Error: File not found: ${schemaPath}`);
    process.exit(1);
  }

  try {
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");
    const protoOutput = motlySchemaToProto(schemaContent, messageName, {
      packageName: typeof options.package === "string" ? options.package : undefined,
    });
    console.log(protoOutput);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

interface ParsedArgs {
  positional: string[];
  options: Record<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, options };
}

function deriveMessageName(filePath: string): string {
  const baseName = filePath.split("/").pop() || "Schema";
  const withoutExt = baseName.replace(/\.(motly|mtly)$/, "");
  return withoutExt
    .replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");
}

main();
