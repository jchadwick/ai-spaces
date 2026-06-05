import { agentAdapter } from "../agent-adapter-instance.js";
import { WorkspacePolicy } from "./workspace-policy.js";

export const workspacePolicy = new WorkspacePolicy(agentAdapter);
