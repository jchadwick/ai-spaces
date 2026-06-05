import type { SpaceConfig } from "@ai-spaces/shared";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    displayName?: string;
  };
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface SpacesResponse {
  spaces: Array<{
    id: string;
    path: string;
    config: SpaceConfig;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface SpaceResponse {
  space: {
    id: string;
    agentId: string;
    agentType: string;
    path: string;
    configPath: string;
    config: SpaceConfig;
    createdAt: string;
    updatedAt: string;
  };
}

export interface FileListItem {
  name: string;
  isDirectory: boolean;
}

export interface FileListResponse {
  files: FileListItem[];
}

export interface FileReadResponse {
  content: string;
}

export interface FileWriteRequest {
  path: string;
  content: string;
}

export class APIClient {
  private baseURL: string;
  private accessToken: string | null = null;

  constructor(baseURL: string = "") {
    this.baseURL = baseURL;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseURL}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: "Unknown error" }))) as {
        error?: string;
      };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.accessToken = response.accessToken;
    return response;
  }

  async refresh(refreshToken: string): Promise<LoginResponse> {
    return this.request<LoginResponse>("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  async logout(): Promise<{ success: boolean }> {
    const response = await this.request<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
    });
    this.accessToken = null;
    return response;
  }

  async getSpaces(): Promise<SpacesResponse> {
    return this.request<SpacesResponse>("/api/spaces");
  }

  async getSpace(id: string): Promise<SpaceResponse> {
    return this.request<SpaceResponse>(`/api/spaces/${id}`);
  }

  async deleteSpace(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/spaces/${id}`, {
      method: "DELETE",
    });
  }

  async listFiles(path: string): Promise<FileListResponse> {
    return this.request<FileListResponse>(`/api/files/list?path=${encodeURIComponent(path)}`);
  }

  async readFile(path: string): Promise<FileReadResponse> {
    return this.request<FileReadResponse>(`/api/files/read?path=${encodeURIComponent(path)}`);
  }

  async writeFile(path: string, content: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("/api/files/write", {
      method: "POST",
      body: JSON.stringify({ path, content }),
    });
  }
}

export const createAPIClient = (baseURL?: string) => new APIClient(baseURL);

export default APIClient;
