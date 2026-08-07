import type { ToolRegistry, QuestionToolName } from '@/ai/tools';
import { clipObservation } from '@/ai/tools';
import type { ToolTrace } from '@/domain/types';

export type ToolRunResult = {
  name: QuestionToolName;
  args: Record<string, unknown>;
  output: unknown;
  trace: ToolTrace;
};

export async function runTool(
  registry: ToolRegistry,
  name: QuestionToolName,
  args: Record<string, unknown>,
): Promise<ToolRunResult> {
  const tool = registry[name];
  if (!tool) throw Error(`Unknown tool: ${name}`);
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    throw Error(`Invalid args for ${name}: ${parsed.error.message}`);
  }
  const output = await tool.execute(parsed.data as Record<string, unknown>);
  const preview = clipObservation(output, 900);
  const resultCount = Array.isArray((output as any)?.items)
    ? (output as any).items.length
    : typeof (output as any)?.count === 'number'
      ? (output as any).count
      : Array.isArray((output as any)?.hits)
        ? (output as any).hits.length
        : undefined;
  return {
    name,
    args: parsed.data as Record<string, unknown>,
    output,
    trace: {
      name,
      input: parsed.data as Record<string, unknown>,
      resultCount,
      preview,
    },
  };
}
