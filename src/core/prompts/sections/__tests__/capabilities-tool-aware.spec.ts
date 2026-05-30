import { describe, it, expect } from "vitest"
import { getCapabilitiesSection } from "../capabilities"
import { ToolAvailabilityContext } from "../../tools/tool-availability-context"

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
		const allTools = [
			"execute_command", "list_files", "search_files", "codebase_search",
			"read_file", "write_to_file", "apply_diff", "edit_file", "search_replace",
			"apply_patch", "ask_followup_question",
		]
		const ctx = new ToolAvailabilityContext(allTools)
		const result = getCapabilitiesSection(cwd, undefined, ctx)
		expect(result).not.toContain("execute_command")
		expect(result).not.toContain("list_files")
		expect(result).toContain("interact with the user's environment")
	})

	it("still includes MCP section when mcpHub is provided", () => {
		const mockMcpHub = { getServers: () => [{ name: "test" }] } as any
		const ctx = new ToolAvailabilityContext([])
		const result = getCapabilitiesSection(cwd, mockMcpHub, ctx)
		expect(result).toContain("MCP servers")
	})

	it("resolves aliases (search_and_replace -> edit)", () => {
		// Disabling search_and_replace should affect edit-related content
		const ctx = new ToolAvailabilityContext(["search_and_replace"])
		const result = getCapabilitiesSection(cwd, undefined, ctx)
		// The "read and write files" category includes search_replace, but also
		// write_to_file, apply_diff, etc. so it should still be present
		expect(result).toContain("read and write files")
	})
})
