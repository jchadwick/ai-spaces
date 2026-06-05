import { z } from "zod";

export const AcpInitializeRequestSchema = z.object({
  type: z.literal("req"),
  id: z.string().min(1),
  method: z.literal("session.initialize"),
  params: z.object({
    protocolVersion: z.string().min(1),
    spaceId: z.string().min(1),
    userId: z.string().min(1),
    role: z.enum(["owner", "editor", "viewer"]),
  }),
});

export const AcpInitializeRequestJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "AcpInitializeRequest",
  type: "object",
  additionalProperties: false,
  required: ["type", "id", "method", "params"],
  properties: {
    type: { const: "req" },
    id: { type: "string", minLength: 1 },
    method: { const: "session.initialize" },
    params: {
      type: "object",
      additionalProperties: false,
      required: ["protocolVersion", "spaceId", "userId", "role"],
      properties: {
        protocolVersion: { type: "string", minLength: 1 },
        spaceId: { type: "string", minLength: 1 },
        userId: { type: "string", minLength: 1 },
        role: { enum: ["owner", "editor", "viewer"] },
      },
    },
  },
} as const;

export const AcpInitializeResponseSchema = z.object({
  type: z.literal("res"),
  id: z.string().min(1),
  result: z.object({
    status: z.enum(["connected", "connecting", "processing"]),
    agentVersion: z.string().min(1),
    capabilities: z.array(z.string()),
  }),
});

export const AcpInitializeResponseJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "AcpInitializeResponse",
  type: "object",
  additionalProperties: false,
  required: ["type", "id", "result"],
  properties: {
    type: { const: "res" },
    id: { type: "string", minLength: 1 },
    result: {
      type: "object",
      additionalProperties: false,
      required: ["status", "agentVersion", "capabilities"],
      properties: {
        status: { enum: ["connected", "connecting", "processing"] },
        agentVersion: { type: "string", minLength: 1 },
        capabilities: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

export type AcpInitializeRequest = z.infer<typeof AcpInitializeRequestSchema>;
export type AcpInitializeResponse = z.infer<typeof AcpInitializeResponseSchema>;
