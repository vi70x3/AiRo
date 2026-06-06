import { getMcpDisabledToolNames } from "../mcp-disabled-tools"
import type { McpHub } from "../../../../services/mcp/McpHub"
import type { McpServer } from "@roo-code/types"

/**
 * Helper to create a mock McpServer with the minimal shape needed by
 * getMcpDisabledToolNames (only `name` and `tools`).
 */
const createMockServer = (
	name: string,
	tools: Array<{ name: string; enabledForPrompt?: boolean }>,
): McpServer =>
	({
		name,
		config: JSON.stringify({ type: "stdio", command: "test" }),
		status: "connected",
		tools: tools.map((t) => ({
			name: t.name,
			description: `${t.name} description`,
			inputSchema: { type: "object", properties: {} },
			enabledForPrompt: t.enabledForPrompt,
		})),
	}) as McpServer

const createMockMcpHub = (servers: McpServer[]): McpHub =>
	({
		getServers: () => servers,
	}) as unknown as McpHub

describe("getMcpDisabledToolNames", () => {
	it("returns empty array when mcpHub is undefined", () => {
		expect(getMcpDisabledToolNames(undefined)).toEqual([])
	})

	it("returns empty array when no servers exist", () => {
		const hub = createMockMcpHub([])
		expect(getMcpDisabledToolNames(hub)).toEqual([])
	})

	it("returns empty array when all tools are enabled", () => {
		const server = createMockServer("testServer", [
			{ name: "tool1", enabledForPrompt: true },
			{ name: "tool2" }, // undefined enabledForPrompt → treated as enabled
		])
		const hub = createMockMcpHub([server])
		expect(getMcpDisabledToolNames(hub)).toEqual([])
	})

	it("collects names only from tools with enabledForPrompt === false", () => {
		const server = createMockServer("testServer", [
			{ name: "enabledTool", enabledForPrompt: true },
			{ name: "disabledTool", enabledForPrompt: false },
		])
		const hub = createMockMcpHub([server])
		const result = getMcpDisabledToolNames(hub)

		expect(result).toHaveLength(1)
		expect(result[0]).toBe("mcp--testServer--disabledTool")
	})

	it("handles multiple servers with mixed enabled/disabled tools", () => {
		const server1 = createMockServer("server1", [
			{ name: "toolA", enabledForPrompt: false },
			{ name: "toolB", enabledForPrompt: true },
		])
		const server2 = createMockServer("server2", [
			{ name: "toolC", enabledForPrompt: false },
		])
		const hub = createMockMcpHub([server1, server2])
		const result = getMcpDisabledToolNames(hub)

		expect(result).toHaveLength(2)
		expect(result).toContain("mcp--server1--toolA")
		expect(result).toContain("mcp--server2--toolC")
		expect(result).not.toContain("mcp--server1--toolB")
	})

	it("skips servers without tools", () => {
		const serverWithTools = createMockServer("withTools", [
			{ name: "tool1", enabledForPrompt: false },
		])
		const serverWithoutTools = createMockServer("withoutTools", [])
		;(serverWithoutTools as any).tools = undefined

		const hub = createMockMcpHub([serverWithTools, serverWithoutTools])
		const result = getMcpDisabledToolNames(hub)

		expect(result).toHaveLength(1)
		expect(result[0]).toBe("mcp--withTools--tool1")
	})

	it("formats names correctly as mcp--serverName--toolName", () => {
		const server = createMockServer("my-server", [
			{ name: "my-tool", enabledForPrompt: false },
		])
		const hub = createMockMcpHub([server])
		const result = getMcpDisabledToolNames(hub)

		expect(result).toEqual(["mcp--my-server--my-tool"])
	})

	it("handles all tools disabled on a server", () => {
		const server = createMockServer("testServer", [
			{ name: "tool1", enabledForPrompt: false },
			{ name: "tool2", enabledForPrompt: false },
			{ name: "tool3", enabledForPrompt: false },
		])
		const hub = createMockMcpHub([server])
		const result = getMcpDisabledToolNames(hub)

		expect(result).toHaveLength(3)
		expect(result).toContain("mcp--testServer--tool1")
		expect(result).toContain("mcp--testServer--tool2")
		expect(result).toContain("mcp--testServer--tool3")
	})
})
