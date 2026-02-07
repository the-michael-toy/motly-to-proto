import { motlySchemaToProto } from "./motly-to-proto.ts";

function main() {
  const args = Deno.args;
  const { positional, options } = parseArgs(args);

  if (positional.length < 1 || options.help) {
    console.error("Usage: deno run --allow-read cli-deno.ts <schema.motly> [MessageName] [options]");
    console.error("");
    console.error("Converts a MOTLY schema file to Protocol Buffers format.");
    console.error("");
    console.error("Options:");
    console.error("  --package <name>  Set the proto package name");
    console.error("  --help            Show this help message");
    Deno.exit(options.help ? 0 : 1);
  }

  const schemaPath = positional[0];
  const messageName = positional[1] || deriveMessageName(schemaPath);

  try {
    const schemaContent = Deno.readTextFileSync(schemaPath);
    const protoOutput = motlySchemaToProto(schemaContent, messageName, {
      packageName: typeof options.package === "string" ? options.package : undefined,
    });
    console.log(protoOutput);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      console.error(`Error: File not found: ${schemaPath}`);
    } else {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
    }
    Deno.exit(1);
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
