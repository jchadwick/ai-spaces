import type { FileMetadataEntry, SpaceMetadata, WorkspacePathFacts } from "@ai-spaces/shared";
import { ACP_WORKSPACE_METHODS, SpaceMetadataSchema } from "@ai-spaces/shared";
import type { SpaceRecord } from "../space-store.js";
import { acpConnectionPool } from "./acp-connection-pool.js";
import type { AgentAdapter, FileNode } from "./agent-adapter.js";

export class ACPAgentAdapter implements AgentAdapter {
  getCircuitStatus(): "CLOSED" | "OPEN" | "HALF_OPEN" {
    return "CLOSED";
  }

  private async ext(
    space: SpaceRecord,
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const connection = await acpConnectionPool.getConnection(space);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`ACP ext method ${method} timed out`)), 30_000),
    );
    return Promise.race([
      connection.extMethod(method, { spaceId: space.id, ...params }) as Promise<
        Record<string, unknown>
      >,
      timeout,
    ]);
  }

  async resolvePath(space: SpaceRecord, filePath: string): Promise<WorkspacePathFacts> {
    return (await this.ext(space, ACP_WORKSPACE_METHODS.RESOLVE_PATH, {
      path: filePath,
    })) as unknown as WorkspacePathFacts;
  }

  async listFiles(
    space: SpaceRecord,
    dirPath: string,
    includeHidden: boolean,
    resolutionToken: string,
  ): Promise<FileNode[]> {
    const result = await this.ext(space, ACP_WORKSPACE_METHODS.LIST_FILES, {
      path: dirPath,
      includeHidden,
      resolutionToken,
    });
    return (result.files as FileNode[] | undefined) ?? [];
  }

  async readFile(
    space: SpaceRecord,
    filePath: string,
    resolutionToken: string,
  ): Promise<{ content: string; contentType: string }> {
    const result = await this.ext(space, ACP_WORKSPACE_METHODS.READ_FILE, {
      path: filePath,
      resolutionToken,
    });
    return {
      content: (result.content as string | undefined) ?? "",
      contentType: (result.contentType as string | undefined) ?? "text/plain",
    };
  }

  async writeFile(
    space: SpaceRecord,
    filePath: string,
    content: string,
    resolutionToken: string,
    encoding?: "utf-8" | "base64",
  ): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.WRITE_FILE, {
      path: filePath,
      content,
      encoding: encoding ?? "utf-8",
      resolutionToken,
    });
  }

  async deleteFile(space: SpaceRecord, filePath: string, resolutionToken: string): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.DELETE_FILE, { path: filePath, resolutionToken });
  }

  async renameFile(
    space: SpaceRecord,
    filePath: string,
    newPath: string,
    sourceResolutionToken: string,
    targetResolutionToken: string,
  ): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.RENAME, {
      path: filePath,
      newPath,
      sourceResolutionToken,
      targetResolutionToken,
    });
  }

  async createDirectory(
    space: SpaceRecord,
    dirPath: string,
    resolutionToken: string,
  ): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.CREATE_DIRECTORY, {
      path: dirPath,
      resolutionToken,
    });
  }

  async deleteDirectory(
    space: SpaceRecord,
    dirPath: string,
    resolutionToken: string,
  ): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.DELETE_DIRECTORY, {
      path: dirPath,
      resolutionToken,
    });
  }

  async renameDirectory(
    space: SpaceRecord,
    dirPath: string,
    newPath: string,
    sourceResolutionToken: string,
    targetResolutionToken: string,
  ): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.RENAME, {
      path: dirPath,
      newPath,
      sourceResolutionToken,
      targetResolutionToken,
    });
  }

  async getMetadata(space: SpaceRecord): Promise<SpaceMetadata> {
    const result = await this.ext(space, ACP_WORKSPACE_METHODS.GET_METADATA, {});
    const parsed = SpaceMetadataSchema.safeParse(result);
    return parsed.success ? parsed.data : { files: {} };
  }

  async patchMetadata(
    space: SpaceRecord,
    files: Record<string, Partial<FileMetadataEntry>>,
  ): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.PATCH_METADATA, { files });
  }
}
