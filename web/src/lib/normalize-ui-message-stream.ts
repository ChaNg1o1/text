"use client";

type StreamChunk = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function hasRecordShape(value: unknown): value is StreamChunk {
  return typeof value === "object" && value !== null;
}

function pickLegacyToolExtras(chunk: StreamChunk): StreamChunk {
  const extras: StreamChunk = {};

  if (typeof chunk.dynamic === "boolean") {
    extras.dynamic = chunk.dynamic;
  }
  if (typeof chunk.providerExecuted === "boolean") {
    extras.providerExecuted = chunk.providerExecuted;
  }
  if (typeof chunk.title === "string") {
    extras.title = chunk.title;
  }
  if (hasRecordShape(chunk.providerMetadata)) {
    extras.providerMetadata = chunk.providerMetadata;
  }

  return extras;
}

function normalizeLegacyToolChunk(
  chunk: StreamChunk,
  seenToolCalls: Set<string>,
): StreamChunk[] | null {
  if (chunk.type === "tool-call") {
    const toolCallId = asString(chunk.toolCallId);
    const toolName = asString(chunk.toolName);
    if (!toolCallId || !toolName) {
      return null;
    }

    const extras = pickLegacyToolExtras(chunk);
    const input = chunk.input ?? chunk.args ?? {};
    const normalized: StreamChunk[] = [];

    if (!seenToolCalls.has(toolCallId)) {
      seenToolCalls.add(toolCallId);
      normalized.push({
        type: "tool-input-start",
        toolCallId,
        toolName,
        ...extras,
      });
    }

    normalized.push({
      type: "tool-input-available",
      toolCallId,
      toolName,
      input,
      ...extras,
    });

    return normalized;
  }

  if (chunk.type === "tool-result") {
    const toolCallId = asString(chunk.toolCallId);
    if (!toolCallId) {
      return null;
    }

    const toolName = asString(chunk.toolName);
    const extras = pickLegacyToolExtras(chunk);
    const input = chunk.input ?? chunk.args;
    const output = chunk.output ?? chunk.result;
    const errorText = asString(chunk.errorText);
    const normalized: StreamChunk[] = [];

    if (!seenToolCalls.has(toolCallId) && toolName) {
      seenToolCalls.add(toolCallId);
      normalized.push({
        type: "tool-input-start",
        toolCallId,
        toolName,
        ...extras,
      });
      if (input !== undefined) {
        normalized.push({
          type: "tool-input-available",
          toolCallId,
          toolName,
          input,
          ...extras,
        });
      }
    }

    if (errorText) {
      normalized.push({
        type: "tool-output-error",
        toolCallId,
        errorText,
        ...(typeof chunk.dynamic === "boolean" ? { dynamic: chunk.dynamic } : {}),
        ...(typeof chunk.providerExecuted === "boolean"
          ? { providerExecuted: chunk.providerExecuted }
          : {}),
      });
      return normalized;
    }

    if (output !== undefined) {
      normalized.push({
        type: "tool-output-available",
        toolCallId,
        output,
        ...(typeof chunk.dynamic === "boolean" ? { dynamic: chunk.dynamic } : {}),
        ...(typeof chunk.providerExecuted === "boolean"
          ? { providerExecuted: chunk.providerExecuted }
          : {}),
      });
      return normalized;
    }
  }

  return null;
}

function normalizeLegacyBlock(
  block: string,
  encoder: TextEncoder,
  seenToolCalls: Set<string>,
): Uint8Array {
  const trimmed = block.trim();
  if (trimmed.length === 0) {
    return encoder.encode("");
  }

  const dataLines = trimmed
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return encoder.encode(`${trimmed}\n\n`);
  }

  const payload = dataLines.join("\n");
  if (payload === "[DONE]") {
    return encoder.encode("data: [DONE]\n\n");
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!hasRecordShape(parsed)) {
      return encoder.encode(`data: ${payload}\n\n`);
    }

    const normalized = normalizeLegacyToolChunk(parsed, seenToolCalls);
    if (!normalized) {
      return encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`);
    }

    return encoder.encode(normalized.map((item) => `data: ${JSON.stringify(item)}\n\n`).join(""));
  } catch {
    return encoder.encode(`data: ${payload}\n\n`);
  }
}

export function normalizeUiMessageStreamResponse(response: Response): Response {
  if (!response.body) {
    return response;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    return response;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const seenToolCalls = new Set<string>();

  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            buffer = buffer.replace(/\r\n/g, "\n");
            if (buffer.trim().length > 0) {
              controller.enqueue(normalizeLegacyBlock(buffer, encoder, seenToolCalls));
            }
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");

          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const normalized = normalizeLegacyBlock(block, encoder, seenToolCalls);
            if (normalized.byteLength > 0) {
              controller.enqueue(normalized);
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}
