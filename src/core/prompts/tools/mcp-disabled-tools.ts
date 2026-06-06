import type { McpHub } from "../../../services/mcp/McpHub"
import { buildMcpToolName } from "../../../utils/mcp-name"

/**
 * Collects the names of all MCP tools that are disabled via per-server
 * `disabledTools` configuration (i.e. tools where `enabledForPrompt === false`).
 *
 * Returns names in the canonical `mcp--serverName--toolName` format so they
 * can be merged into the ToolAvailabilityContext alongside native disabled tools.
 *
 * @param mcpHub - The McpHub instance containing connected servers.
 * @returns Array of disabled MCP tool names, or empty array if no hub / no servers.
 */
export function getMcpDisabledToolNames(mcpHub?: McpHub): string[] {
	if (!mcpHub) {
		return []
	}

	const servers = mcpHub.getServers()
	const disabledNames: string[] = []

	for (const server of servers) {
		if (!server.tools) {
			continue
		}
		for (const tool of server.tools) {
			if (tool.enabledForPrompt === false) {
				disabledNames.push(buildMcpToolName(server.name, tool.name))
			}
		}
	}

	return disabledNames
}
