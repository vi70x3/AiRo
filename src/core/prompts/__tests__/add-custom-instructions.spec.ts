// npx vitest core/prompts/__tests__/add-custom-instructions.spec.ts

vi.mock("os", () => ({
	default: {
		homedir: () => "/home/user",
		platform: () => "linux",
		arch: () => "x64",
		type: () => "Linux",
		release: () => "5.4.0",
		hostname: () => "test-host",
		tmpdir: () => "/tmp",
		endianness: () => "LE",
		loadavg: () => [0, 0, 0],
		totalmem: () => 8589934592,
		freemem: () => 4294967296,
		cpus: () => [],
		networkInterfaces: () => ({}),
		userInfo: () => ({ username: "test", uid: 1000, gid: 1000, shell: "/bin/bash", homedir: "/home/user" }),
	},
	homedir: () => "/home/user",
	platform: () => "linux",
	arch: () => "x64",
	type: () => "Linux",
	release: () => "5.4.0",
	hostname: () => "test-host",
	tmpdir: () => "/tmp",
	endianness: () => "LE",
	loadavg: () => [0, 0, 0],
	totalmem: () => 8589934592,
	freemem: () => 4294967296,
	cpus: () => [],
	networkInterfaces: () => ({}),
	userInfo: () => ({ username: "test", uid: 1000, gid: 1000, shell: "/bin/bash", homedir: "/home/user" }),
}))

vi.mock("default-shell", () => ({
	default: "/bin/zsh",
}))

vi.mock("os-name", () => ({
	default: () => "Linux",
}))

vi.mock("fs/promises")

import * as vscode from "vscode"

import { ModeConfig } from "@roo-code/types"

import { SYSTEM_PROMPT } from "../system"
import { McpHub } from "../../../services/mcp/McpHub"
import { defaultModeSlug, modes, Mode } from "../../../shared/modes"
import "../../../utils/path"
import { addCustomInstructions } from "../sections/custom-instructions"
import { MultiSearchReplaceDiffStrategy } from "../../diff/strategies/multi-search-replace"

// Mock the sections
vi.mock("../sections/modes", () => ({
	getModesSection: vi.fn().mockImplementation(async () => `====\n\nMODES\n\n- Test modes section`),
}))

// Mock the custom instructions
vi.mock("../sections/custom-instructions", () => {
	const addCustomInstructions = vi.fn()
	return {
		addCustomInstructions,
		__setMockImplementation: (impl: any) => {
			addCustomInstructions.mockImplementation(impl)
		},
	}
})

// Set up default mock implementation
const customInstructionsMock = vi.mocked(await import("../sections/custom-instructions"))
const { __setMockImplementation } = customInstructionsMock as any
__setMockImplementation(
	async (
		modeCustomInstructions: string,
		globalCustomInstructions: string,
		cwd: string,
		mode: string,
		options?: { language?: string; settings?: { disabledTools?: string[] } },
	) => {
		const sections = []

		// Add language preference if provided
		if (options?.language) {
			sections.push(
				`Language Preference:\nYou should always speak and think in the "${options.language}" language.`,
			)
		}

		// Add global instructions first
		if (globalCustomInstructions?.trim()) {
			sections.push(`Global Instructions:\n${globalCustomInstructions.trim()}`)
		}

		// Add mode-specific instructions after
		if (modeCustomInstructions?.trim()) {
			sections.push(`Mode-specific Instructions:\n${modeCustomInstructions}`)
		}

		// Add rules
		const rules = []
		if (mode) {
			rules.push(`# Rules from .clinerules-${mode}:\nMock mode-specific rules`)
		}
		rules.push(`# Rules from .clinerules:\nMock generic rules`)

		if (rules.length > 0) {
			sections.push(`Rules:\n${rules.join("\n")}`)
		}

		const joinedSections = sections.join("\n\n")

		// Generate disclaimer if custom instructions reference disabled tools
		let disclaimer = ""
		if (options?.settings?.disabledTools?.length) {
			const referencedTools = options.settings.disabledTools.filter(
				(tool: string) => new RegExp(`\\b${tool}\\b`).test(joinedSections)
			)
			if (referencedTools.length > 0) {
				disclaimer = `\n\nNote: The following tools referenced in your instructions are currently disabled in this session: ${referencedTools.join(", ")}. Do not attempt to use them.`
			}
		}

		return joinedSections
			? `\n====\n\nUSER'S CUSTOM INSTRUCTIONS\n\nThe following additional instructions are provided by the user, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.\n\n${joinedSections}${disclaimer}`
			: ""
	},
)

// Mock vscode language
vi.mock("vscode", () => ({
	env: {
		language: "en",
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/path" } }],
		getWorkspaceFolder: vi.fn().mockReturnValue({ uri: { fsPath: "/test/path" } }),
	},
	window: {
		activeTextEditor: undefined,
	},
	EventEmitter: vi.fn().mockImplementation(() => ({
		event: vi.fn(),
		fire: vi.fn(),
		dispose: vi.fn(),
	})),
}))

vi.mock("../../../utils/shell", () => ({
	getShell: () => "/bin/zsh",
}))

// Create a mock ExtensionContext
const mockContext = {
	extensionPath: "/mock/extension/path",
	globalStoragePath: "/mock/storage/path",
	storagePath: "/mock/storage/path",
	logPath: "/mock/log/path",
	subscriptions: [],
	workspaceState: {
		get: () => undefined,
		update: () => Promise.resolve(),
	},
	globalState: {
		get: () => undefined,
		update: () => Promise.resolve(),
		setKeysForSync: () => {},
	},
	extensionUri: { fsPath: "/mock/extension/path" },
	globalStorageUri: { fsPath: "/mock/settings/path" },
	asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
	extension: {
		packageJSON: {
			version: "1.0.0",
		},
	},
} as unknown as vscode.ExtensionContext

// Instead of extending McpHub, create a mock that implements just what we need
const createMockMcpHub = (withServers: boolean = false): McpHub =>
	({
		getServers: () =>
			withServers
				? [
						{
							name: "test-server",
							disabled: false,
							resources: [{ uri: "test://resource", name: "Test Resource" }],
						},
					]
				: [],
		getMcpServersPath: async () => "/mock/mcp/path",
		getMcpSettingsFilePath: async () => "/mock/settings/path",
		dispose: async () => {},
		// Add other required public methods with no-op implementations
		restartConnection: async () => {},
		readResource: async () => ({ contents: [] }),
		callTool: async () => ({ content: [] }),
		toggleServerDisabled: async () => {},
		toggleToolAlwaysAllow: async () => {},
		isConnecting: false,
		connections: [],
	}) as unknown as McpHub

describe("addCustomInstructions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should generate correct prompt for spec mode", async () => {
		const prompt = await SYSTEM_PROMPT(
			mockContext,
			"/test/path",
			false, // supportsImages
			undefined, // mcpHub
			undefined, // diffStrategy
			"spec", // mode
			undefined, // customModePrompts
			undefined, // customModes
			undefined, // globalCustomInstructions
			undefined, // experiments
			undefined, // language
			undefined, // rooIgnoreInstructions
			undefined, // partialReadsEnabled
		)

		expect(prompt).toMatchFileSnapshot("./__snapshots__/add-custom-instructions/spec-mode-prompt.snap")
	})

	it("should generate correct prompt for ask mode", async () => {
		const prompt = await SYSTEM_PROMPT(
			mockContext,
			"/test/path",
			false, // supportsImages
			undefined, // mcpHub
			undefined, // diffStrategy
			"ask", // mode
			undefined, // customModePrompts
			undefined, // customModes
			undefined, // globalCustomInstructions
			undefined, // experiments
			undefined, // language
			undefined, // rooIgnoreInstructions
			undefined, // partialReadsEnabled
		)

		expect(prompt).toMatchFileSnapshot("./__snapshots__/add-custom-instructions/ask-mode-prompt.snap")
	})

	it("should exclude MCP server creation info when disabled", async () => {
		const mockMcpHub = createMockMcpHub(false)

		const prompt = await SYSTEM_PROMPT(
			mockContext,
			"/test/path",
			false, // supportsImages
			mockMcpHub, // mcpHub
			undefined, // diffStrategy
			defaultModeSlug, // mode
			undefined, // customModePrompts
			undefined, // customModes,
			undefined, // globalCustomInstructions
			undefined, // experiments
			undefined, // language
			undefined, // rooIgnoreInstructions
			undefined, // partialReadsEnabled
		)

		expect(prompt).not.toContain("Creating an MCP Server")
		expect(prompt).toMatchFileSnapshot("./__snapshots__/add-custom-instructions/mcp-server-creation-disabled.snap")
	})

	it("should prioritize mode-specific rules for spec mode", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", defaultModeSlug)
		expect(instructions).toMatchFileSnapshot("./__snapshots__/add-custom-instructions/spec-mode-rules.snap")
	})

	it("should prioritize mode-specific rules for ask mode", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", modes[2].slug)
		expect(instructions).toMatchFileSnapshot("./__snapshots__/add-custom-instructions/ask-mode-rules.snap")
	})

	it("should prioritize mode-specific rules for vibe mode", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", modes[1].slug)
		expect(instructions).toMatchFileSnapshot("./__snapshots__/add-custom-instructions/vibe-mode-rules.snap")
	})

	it("should prioritize mode-specific rules for test engineer mode", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", "test")
		expect(instructions).toMatchFileSnapshot(
			"./__snapshots__/add-custom-instructions/test-engineer-mode-rules.snap",
		)
	})

	it("should prioritize mode-specific rules for code reviewer mode", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", "review")
		expect(instructions).toMatchFileSnapshot(
			"./__snapshots__/add-custom-instructions/code-reviewer-mode-rules.snap",
		)
	})

	it("should fall back to generic rules when mode-specific rules not found", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", defaultModeSlug)
		expect(instructions).toMatchFileSnapshot("./__snapshots__/add-custom-instructions/generic-rules-fallback.snap")
	})

	it("should include preferred language when provided", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", defaultModeSlug, {
			language: "es",
		})
		expect(instructions).toMatchFileSnapshot("./__snapshots__/add-custom-instructions/with-preferred-language.snap")
	})

	it("should include custom instructions when provided", async () => {
		const instructions = await addCustomInstructions("Custom test instructions", "", "/test/path", defaultModeSlug)
		expect(instructions).toMatchFileSnapshot(
			"./__snapshots__/add-custom-instructions/with-custom-instructions.snap",
		)
	})

	it("should combine all custom instructions", async () => {
		const instructions = await addCustomInstructions(
			"Custom test instructions",
			"",
			"/test/path",
			defaultModeSlug,
			{ language: "fr" },
		)
		expect(instructions).toMatchFileSnapshot(
			"./__snapshots__/add-custom-instructions/combined-custom-instructions.snap",
		)
	})

	it("should handle undefined mode-specific instructions", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", defaultModeSlug)
		expect(instructions).toMatchFileSnapshot(
			"./__snapshots__/add-custom-instructions/undefined-mode-instructions.snap",
		)
	})

	it("should trim mode-specific instructions", async () => {
		const instructions = await addCustomInstructions(
			"  Custom mode instructions  ",
			"",
			"/test/path",
			defaultModeSlug,
		)
		expect(instructions).toMatchFileSnapshot(
			"./__snapshots__/add-custom-instructions/trimmed-mode-instructions.snap",
		)
	})

	it("should handle empty mode-specific instructions", async () => {
		const instructions = await addCustomInstructions("", "", "/test/path", defaultModeSlug)
		expect(instructions).toMatchFileSnapshot("./__snapshots__/add-custom-instructions/empty-mode-instructions.snap")
	})

	it("should combine global and mode-specific instructions", async () => {
		const instructions = await addCustomInstructions(
			"Mode-specific instructions",
			"Global instructions",
			"/test/path",
			defaultModeSlug,
		)
		expect(instructions).toMatchFileSnapshot(
			"./__snapshots__/add-custom-instructions/global-and-mode-instructions.snap",
		)
	})

	it("should prioritize mode-specific instructions after global ones", async () => {
		const instructions = await addCustomInstructions(
			"Second instruction",
			"First instruction",
			"/test/path",
			defaultModeSlug,
		)

		const instructionParts = instructions.split("\n\n")
		const globalIndex = instructionParts.findIndex((part) => part.includes("First instruction"))
		const modeSpecificIndex = instructionParts.findIndex((part) => part.includes("Second instruction"))

		expect(globalIndex).toBeLessThan(modeSpecificIndex)
		expect(instructions).toMatchFileSnapshot(
			"./__snapshots__/add-custom-instructions/prioritized-instructions-order.snap",
		)
	})
})


describe("addCustomInstructions - disabled tools disclaimer", () => {
	it("appends disclaimer when custom instructions reference a disabled tool", async () => {
		const result = await addCustomInstructions(
			"Always use execute_command to run tests",
			"",
			"/test/path",
			"code",
			{
				settings: { disabledTools: ["execute_command"] },
			},
		)
		expect(result).toContain("execute_command")
		expect(result).toContain("currently disabled")
		expect(result).toContain("Do not attempt to use them")
	})

	it("does not append disclaimer when custom instructions do not reference disabled tools", async () => {
		const result = await addCustomInstructions(
			"Always write clean code",
			"",
			"/test/path",
			"code",
			{
				settings: { disabledTools: ["execute_command"] },
			},
		)
		expect(result).not.toContain("currently disabled")
		expect(result).not.toContain("Do not attempt to use them")
	})

	it("does not append disclaimer when no tools are disabled", async () => {
		const result = await addCustomInstructions(
			"Always use execute_command to run tests",
			"",
			"/test/path",
			"code",
			{
				settings: { disabledTools: [] },
			},
		)
		expect(result).not.toContain("currently disabled")
	})

	it("does not append disclaimer when settings is undefined", async () => {
		const result = await addCustomInstructions(
			"Always use execute_command to run tests",
			"",
			"/test/path",
			"code",
			{},
		)
		expect(result).not.toContain("currently disabled")
	})

	it("lists all disabled tools that are referenced", async () => {
		const result = await addCustomInstructions(
			"Use execute_command and list_files for exploration",
			"",
			"/test/path",
			"code",
			{
				settings: { disabledTools: ["execute_command", "list_files"] },
			},
		)
		expect(result).toContain("execute_command")
		expect(result).toContain("list_files")
		expect(result).toContain("currently disabled")
	})
})
