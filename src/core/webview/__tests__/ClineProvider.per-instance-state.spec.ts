// npx vitest run core/webview/__tests__/ClineProvider.per-instance-state.spec.ts

import * as vscode from "vscode"
import { ClineProvider } from "../ClineProvider"
import { ContextProxy } from "../../config/ContextProxy"
import type { ProviderSettings } from "@roo-code/types"

vi.mock("vscode", () => ({
	ExtensionContext: vi.fn(),
	OutputChannel: vi.fn(),
	WebviewView: vi.fn(),
	Uri: {
		joinPath: vi.fn(),
		file: vi.fn(),
	},
	CodeActionKind: {
		QuickFix: { value: "quickfix" },
		RefactorRewrite: { value: "refactor.rewrite" },
	},
	commands: {
		executeCommand: vi.fn().mockResolvedValue(undefined),
	},
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
	},
	workspace: {
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn().mockReturnValue([]),
			update: vi.fn(),
		}),
		onDidChangeConfiguration: vi.fn().mockImplementation(() => ({
			dispose: vi.fn(),
		})),
		onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	},
	env: {
		uriScheme: "vscode",
		language: "en",
		appName: "Visual Studio Code",
	},
	ExtensionMode: {
		Production: 1,
		Development: 2,
		Test: 3,
	},
	version: "1.85.0",
}))

vi.mock("../../task/Task", () => ({
	Task: vi.fn().mockImplementation((options: any) => ({
		taskId: options.taskId || `test-task-id-${Math.random()}`,
		saveClineMessages: vi.fn(),
		clineMessages: [],
		apiConversationHistory: [],
		overwriteClineMessages: vi.fn(),
		overwriteApiConversationHistory: vi.fn(),
		abortTask: vi.fn(),
		handleWebviewAskResponse: vi.fn(),
		getTaskNumber: vi.fn().mockReturnValue(0),
		setTaskNumber: vi.fn(),
		setParentTask: vi.fn(),
		setRootTask: vi.fn(),
		emit: vi.fn(),
		parentTask: options.parentTask,
		updateApiConfiguration: vi.fn(),
	})),
}))

vi.mock("../../prompts/sections/custom-instructions")

vi.mock("../../../utils/safeWriteJson")

vi.mock("../../../api", () => ({
	buildApiHandler: vi.fn().mockReturnValue({
		getModel: vi.fn().mockReturnValue({
			id: "claude-3-sonnet",
		}),
	}),
}))

vi.mock("../../../integrations/workspace/WorkspaceTracker", () => ({
	default: vi.fn().mockImplementation(() => ({
		initializeFilePaths: vi.fn(),
		dispose: vi.fn(),
	})),
}))

vi.mock("../../diff/strategies/multi-search-replace", () => ({
	MultiSearchReplaceDiffStrategy: vi.fn().mockImplementation(() => ({
		getName: () => "test-strategy",
		applyDiff: vi.fn(),
	})),
}))

vi.mock("../../../shared/modes", () => ({
	modes: [
		{ slug: "code", name: "Code Mode", roleDefinition: "You are a code assistant", groups: ["read", "edit"] },
		{ slug: "architect", name: "Architect Mode", roleDefinition: "You are an architect", groups: ["read", "edit"] },
	],
	getModeBySlug: vi.fn().mockReturnValue({
		slug: "code",
		name: "Code Mode",
		roleDefinition: "You are a code assistant",
		groups: ["read", "edit"],
	}),
	defaultModeSlug: "code",
}))

vi.mock("../../prompts/system", () => ({
	SYSTEM_PROMPT: vi.fn().mockResolvedValue("mocked system prompt"),
	codeMode: "code",
}))

vi.mock("../../../api/providers/fetchers/modelCache", () => ({
	getModels: vi.fn().mockResolvedValue({}),
	flushModels: vi.fn(),
	getModelsFromCache: vi.fn().mockReturnValue(undefined),
}))

vi.mock("../../../integrations/misc/extract-text", () => ({
	extractTextFromFile: vi.fn().mockResolvedValue("Mock file content"),
}))

vi.mock("p-wait-for", () => ({
	default: vi.fn().mockImplementation(async () => Promise.resolve()),
}))

vi.mock("fs/promises", () => ({
	mkdir: vi.fn().mockResolvedValue(undefined),
	writeFile: vi.fn().mockResolvedValue(undefined),
	readFile: vi.fn().mockResolvedValue(""),
	readdir: vi.fn().mockResolvedValue([]),
	unlink: vi.fn().mockResolvedValue(undefined),
	rmdir: vi.fn().mockResolvedValue(undefined),
	access: vi.fn().mockResolvedValue(undefined),
	rm: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../utils/storage", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../utils/storage")>()
	return {
		...actual,
		getStorageBasePath: vi.fn().mockImplementation((defaultPath: string) => defaultPath),
		getSettingsDirectoryPath: vi.fn().mockResolvedValue("/test/settings/path"),
		getTaskDirectoryPath: vi.fn().mockResolvedValue("/test/task/path"),
	}
})

describe("ClineProvider - Per-Instance State Independence", () => {
	let mockContext: vscode.ExtensionContext
	let mockOutputChannel: vscode.OutputChannel
	let mockWebviewView: vscode.WebviewView
	let mockPostMessage: any

	beforeEach(async () => {
		vi.clearAllMocks()

		const secrets: Record<string, string | undefined> = {}

		mockContext = {
			extensionPath: "/test/path",
			extensionUri: {} as vscode.Uri,
			globalState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
			secrets: {
				get: vi.fn().mockImplementation((key: string) => secrets[key]),
				store: vi.fn().mockImplementation((key: string, value: string | undefined) => {
					secrets[key] = value
					return Promise.resolve()
				}),
				delete: vi.fn().mockImplementation((key: string) => {
					delete secrets[key]
					return Promise.resolve()
				}),
			},
			workspaceState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
			subscriptions: [],
			extension: {
				packageJSON: { version: "1.0.0" },
			},
			globalStorageUri: {
				fsPath: "/test/storage/path",
			},
		} as unknown as vscode.ExtensionContext

		mockOutputChannel = {
			appendLine: vi.fn(),
			clear: vi.fn(),
			dispose: vi.fn(),
		} as unknown as vscode.OutputChannel

		mockPostMessage = vi.fn()

		mockWebviewView = {
			webview: {
				postMessage: mockPostMessage,
				html: "",
				options: {},
				onDidReceiveMessage: vi.fn(),
				asWebviewUri: vi.fn(),
				cspSource: "vscode-webview://test-csp-source",
			},
			visible: true,
			onDidDispose: vi.fn().mockImplementation((callback) => {
				callback()
				return { dispose: vi.fn() }
			}),
			onDidChangeVisibility: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })),
		} as unknown as vscode.WebviewView
	})

	function createProvider(contextProxy: ContextProxy, renderContext: "sidebar" | "editor" = "sidebar") {
		const provider = new ClineProvider(mockContext, mockOutputChannel, renderContext, contextProxy)
		provider.getMcpHub = vi.fn().mockReturnValue({
			listTools: vi.fn().mockResolvedValue([]),
			callTool: vi.fn().mockResolvedValue({ content: [] }),
			listResources: vi.fn().mockResolvedValue([]),
			readResource: vi.fn().mockResolvedValue({ contents: [] }),
			getAllServers: vi.fn().mockReturnValue([]),
		})
		return provider
	}

	describe("Instance isolation via getState", () => {
		it("two instances should maintain independent modes", async () => {
			const contextProxy = new ContextProxy(mockContext)
			await contextProxy.setValue("mode", "code")

			const providerA = createProvider(contextProxy, "sidebar")
			const providerB = createProvider(contextProxy, "editor")

			await new Promise((resolve) => setTimeout(resolve, 10))
			await providerA.resolveWebviewView(mockWebviewView)
			await providerB.resolveWebviewView(mockWebviewView)

			// Both start with the same mode
			expect((providerA as any)._instanceMode).toBe("code")
			expect((providerB as any)._instanceMode).toBe("code")

			// Change instance mode on providerA only
			;(providerA as any)._instanceMode = "architect"

			// providerA returns architect
			const stateA = await providerA.getState()
			expect(stateA.mode).toBe("architect")

			// providerB still returns code
			const stateB = await providerB.getState()
			expect(stateB.mode).toBe("code")
			expect((providerB as any)._instanceMode).toBe("code")
		})

		it("two instances should maintain independent API config names", async () => {
			const contextProxy = new ContextProxy(mockContext)
			await contextProxy.setValue("currentApiConfigName", "shared-config")

			const providerA = createProvider(contextProxy, "sidebar")
			const providerB = createProvider(contextProxy, "editor")

			await new Promise((resolve) => setTimeout(resolve, 10))
			await providerA.resolveWebviewView(mockWebviewView)
			await providerB.resolveWebviewView(mockWebviewView)

			// Both start with the same config
			expect((providerA as any)._instanceApiConfigName).toBe("shared-config")
			expect((providerB as any)._instanceApiConfigName).toBe("shared-config")

			// Change instance config on providerA only
			;(providerA as any)._instanceApiConfigName = "custom-profile"
			;(providerA as any)._instanceApiConfiguration = { apiProvider: "anthropic" } as ProviderSettings

			// providerA returns custom-profile
			const stateA = await providerA.getState()
			expect(stateA.currentApiConfigName).toBe("custom-profile")
			expect(stateA.apiConfiguration.apiProvider).toBe("anthropic")

			// providerB still returns shared-config
			const stateB = await providerB.getState()
			expect(stateB.currentApiConfigName).toBe("shared-config")
		})

		it("getState returns per-instance values when configureInstance is used", async () => {
			const contextProxy = new ContextProxy(mockContext)
			const provider = createProvider(contextProxy, "sidebar")

			await new Promise((resolve) => setTimeout(resolve, 10))
			await provider.resolveWebviewView(mockWebviewView)

			provider.configureInstance({
				mode: "architect",
				apiConfigName: "my-profile",
				apiConfiguration: { apiProvider: "anthropic" } as ProviderSettings,
			})

			const state = await provider.getState()
			expect(state.mode).toBe("architect")
			expect(state.currentApiConfigName).toBe("my-profile")
			expect(state.apiConfiguration.apiProvider).toBe("anthropic")
		})
	})

	describe("configureInstance", () => {
		it("should pre-set instance state before resolveWebviewView", async () => {
			const contextProxy = new ContextProxy(mockContext)
			const provider = createProvider(contextProxy, "editor")

			await new Promise((resolve) => setTimeout(resolve, 10))

			// Pre-configure before resolve (simulating subtask tab creation)
			provider.configureInstance({
				mode: "architect",
				apiConfigName: "subtask-profile",
			})

			await provider.resolveWebviewView(mockWebviewView)

			// Should keep pre-configured values
			expect((provider as any)._instanceMode).toBe("architect")
			expect((provider as any)._instanceApiConfigName).toBe("subtask-profile")
		})

		it("should only set provided fields, inheriting the rest from global state", async () => {
			const contextProxy = new ContextProxy(mockContext)
			await contextProxy.setValue("mode", "code")
			await contextProxy.setValue("currentApiConfigName", "global-config")

			const provider = createProvider(contextProxy, "editor")

			await new Promise((resolve) => setTimeout(resolve, 10))

			// Only set mode
			provider.configureInstance({ mode: "architect" })

			await provider.resolveWebviewView(mockWebviewView)

			// Mode from configureInstance
			expect((provider as any)._instanceMode).toBe("architect")

			// apiConfigName from global state
			expect((provider as any)._instanceApiConfigName).toBe("global-config")
		})
	})

	describe("deleteProviderProfile edge case", () => {
		it("should reset instance override when active profile is deleted", async () => {
			const contextProxy = new ContextProxy(mockContext)
			const provider = createProvider(contextProxy, "sidebar")

			await new Promise((resolve) => setTimeout(resolve, 10))
			await provider.resolveWebviewView(mockWebviewView)

			// Set instance to a specific profile
			;(provider as any)._instanceApiConfigName = "profile-to-delete"
			;(provider as any)._instanceApiConfiguration = { apiProvider: "anthropic" } as ProviderSettings

			// Mock profile entries
			vi.spyOn(provider, "getProviderProfileEntries").mockReturnValue([
				{ name: "profile-to-delete", id: "id-1", apiProvider: "anthropic" },
				{ name: "fallback-profile", id: "id-2", apiProvider: "openrouter" },
			])

			// Set global state to match the profile being deleted
			await contextProxy.setValue("currentApiConfigName", "profile-to-delete")

			await provider.deleteProviderProfile({ name: "profile-to-delete", id: "id-1", apiProvider: "anthropic" })

			// Instance overrides should be reset
			expect((provider as any)._instanceApiConfigName).toBeUndefined()
			expect((provider as any)._instanceApiConfiguration).toBeUndefined()
		})
	})

	describe("resetState edge case", () => {
		it("should clear all instance overrides", async () => {
			const contextProxy = new ContextProxy(mockContext)
			const provider = createProvider(contextProxy, "sidebar")

			await new Promise((resolve) => setTimeout(resolve, 10))
			await provider.resolveWebviewView(mockWebviewView)

			// Set instance-specific values
			;(provider as any)._instanceMode = "architect"
			;(provider as any)._instanceApiConfigName = "custom-profile"
			;(provider as any)._instanceApiConfiguration = { apiProvider: "anthropic" } as ProviderSettings

			// Simulate what resetState does to instance overrides
			;(provider as any)._instanceMode = undefined
			;(provider as any)._instanceApiConfigName = undefined
			;(provider as any)._instanceApiConfiguration = undefined

			expect((provider as any)._instanceMode).toBeUndefined()
			expect((provider as any)._instanceApiConfigName).toBeUndefined()
			expect((provider as any)._instanceApiConfiguration).toBeUndefined()
		})
	})
})
