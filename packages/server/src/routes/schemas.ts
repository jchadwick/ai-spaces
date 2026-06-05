import {
  AcpInitializeRequestJsonSchema,
  AcpInitializeResponseJsonSchema,
  SpaceConfigJsonSchema,
} from "@ai-spaces/shared";
import { Hono } from "hono";

export const schemasRouter = new Hono();

const schemas: Record<string, unknown> = {
  "acp/initialize-request.json": AcpInitializeRequestJsonSchema,
  "acp/initialize-response.json": AcpInitializeResponseJsonSchema,
  "manifest.json": SpaceConfigJsonSchema,
};

schemasRouter.get("/:schemaPath{.*}", (c) => {
  const schema = schemas[c.req.param("schemaPath")];
  if (!schema) return c.json({ error: "Schema not found" }, 404);
  return c.json(schema, 200, {
    "Cache-Control": "no-cache",
  });
});
