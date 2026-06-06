import { describe, it, expect } from "vitest"
import { getCapabilitiesSection } from "../capabilities"
import { ToolAvailabilityContext, ALL_NATIVE_TOOL_NAMES } from "../../tools/tool-availability-context"

describe("getCapabilitiesSection - tool aware", () => {
	const cwd = "/test/path"

	it("produces original content when toolContext is undefined", () => {
		const result = getCapabilitiesSection(cwd, undefined, undefined)
		expect(result).toContain("execute CLI commands on the user's computer, list files, view source code definitions, regex search, read and write files, and ask follow-up questions")
		expect(result).toContain("execute_command tool")
		expect(result).toContain("list_files tool")
	})

	it("produces original content when no tools are disabled", () => {
		const ctx = new ToolAvailabilityContext([])
		const result = getCapabilitiesSection(cwd, undefined, ctx)
		expect(result).toContain("execute_command tool")
		expect(result).toContain("list_files tool")
	})

	it("removes execute_command paragraph when execute_command is disabled", () => {
		const ctx = new ToolAvailabilityContext(["execute_command"])
		const result = getCapabilitiesSection(cwd, undefined, ctx)
		expect(result).not.toContain("execute_command tool")
		expect(result).not.toContain("You can use the execute_command tool")
		expect(result).toContain("list_files tool")
	})

	it("removes list_files references when list_files is disabled", () => {
		const ctx = new ToolAvailabilityContext(["list_files"])
		const result = getCapabilitiesSection(cwd, undefined, ctx)
		expect(result).not.toContain("list_files tool")
		expect(result).toContain("execute_command tool")
	})

	it("dynamically composes summary line with only available tool categories", () => {
		const ctx = new ToolAvailabilityContext(["execute_command", "list_files"])
		const result = getCapabilitiesSection(cwd, undefined, ctx)
		// Should not mention CLI commands or list files in summary
		expect(result).not.toContain("execute CLI commands")
		expect(result).not.toContain("list files")
		// Should still mention other categories
		expect(result).toContain("view source code definitions")
		expect(result).toContain("read and write files")
	})

	it("handles all tools disabled with minimal fallback", () => {
		// Disable ALL native tools to trigger the minimal fallback
		const ctx = new ToolAvailabilityContext(ALL_NATIVE_TOOL_NAMES)
		const result = getCapabilitiesSection(cwd, undefined, ctx)
		expect(result).not.toContain("execute_command")
		expect(result).not.toContain("list_files")
		expect(result).toContain("interact with the user's environment")
	})

	it("still includes MCP section when mcpHub is provided with enabled tools", () => {
		const mockMcpHub = {
			getServers: () => [{ name: "test", tools: [{ name: "tool1", enabledForPrompt: true }] }],
		} as any
		const ctx = new ToolAvailabilityContext([])
		const result = getCapabilitiesSection(cwd, mockMcpHub, ctx)
		expect(result).toContain("MCP servers")
	})

	it("omits MCP section when all MCP tools are disabled", () => {
		const mockMcpHub = {
			getServers: () => [{ name: "test", tools: [{ name: "tool1", enabledForPrompt: false }] }],
		} as any
		const ctx = new ToolAvailabilityContext([])
		const result = getCapabilitiesSection(cwd, mockMcpHub, ctx)
		expect(result).not.toContain("MCP servers")
	})

	it("omits MCP section when server has no tools", () => {
		const mockMcpHub = {
			getServers: () => [{ name: "test", tools: [] }],
		} as any
		const ctx = new ToolAvailabilityContext([])
		const result = getCapabilitiesSection(cwd, mockMcpHub, ctx)
		expect(result).not.toContain("MCP servers")
	})

	it("includes MCP section when at least one tool is enabled across servers", () => {
		const mockMcpHub = {
			getServers: () => [
				{ name: "server1", tools: [{ name: "tool1", enabledForPrompt: false }] },
				{ name: "server2", tools: [{ name: "tool2", enabledForPrompt: true }] },
			],
		} as any
		const ctx = new ToolAvailabilityContext([])
		const result = getCapabilitiesSection(cwd, mockMcpHub, ctx)
		expect(result).toContain("MCP servers")
	})

	it("resolves aliases (search_and_replace -> edit)", () => {
		// Disable search_and_replace (alias for edit) plus all other tools in the
		// "read and write files" category to verify alias resolution removes the category
		const ctx = new ToolAvailabilityContext([
			"search_and_replace", "write_to_file", "apply_diff", "edit_file", "apply_patch",
		])
		const result = getCapabilitiesSection(cwd, undefined, ctx)
		// With all "read and write files" tools disabled, the category should be absent
		expect(result).not.toContain("read and write files")
	})

	it("uses 'and' without comma for exactly two capabilities", () => {
		// Disable all tools in "edit" category to leave exactly 2 categories:
		// "view source code definitions" (read_file) and "ask follow-up questions" (ask_followup_question)
		const ctx = new ToolAvailabilityContext([
			"execute_command", "list_files", "search_files", "codebase_search",
			"write_to_file", "apply_diff", "edit_file", "edit", "apply_patch",
		])
		const result = getCapabilitiesSection("/test/path", undefined, ctx)
		// Should be "view source code definitions and ask follow-up questions" (no comma)
		expect(result).toContain("view source code definitions and ask follow-up questions")
		expect(result).not.toContain("view source code definitions, and ask follow-up questions")
	})

	it("uses serial comma for three or more capabilities", () => {
		// Disable only execute_command — leaves 5 categories
		const ctx = new ToolAvailabilityContext(["execute_command"])
		const result = getCapabilitiesSection("/test/path", undefined, ctx)
		// Should have ", and" before the last item
		expect(result).toContain(", and ask follow-up questions")
	})

	it("includes MCP section when server has resources but no tools", () => {
		const mockMcpHub = {
			getServers: () => [{
				name: "test",
				resources: [{ uri: "test://resource", name: "test-resource" }],
			}],
		} as any
		const ctx = new ToolAvailabilityContext([])
		const result = getCapabilitiesSection(cwd, mockMcpHub, ctx)
		expect(result).toContain("MCP servers")
	})

	it("includes MCP section when server has resourceTemplates but no tools", () => {
		const mockMcpHub = {
			getServers: () => [{
				name: "test",
				resourceTemplates: [{ uriTemplate: "test://{id}", name: "test-template" }],
			}],
		} as any
		const ctx = new ToolAvailabilityContext([])
		const result = getCapabilitiesSection(cwd, mockMcpHub, ctx)
		expect(result).toContain("MCP servers")
	})

	it("omits MCP section when server has empty resources array", () => {
		const mockMcpHub = {
			getServers: () => [{
				name: "test",
				resources: [],
			}],
		} as any
		const ctx = new ToolAvailabilityContext([])
		const result = getCapabilitiesSection(cwd, mockMcpHub, ctx)
		expect(result).not.toContain("MCP servers")
	})
})