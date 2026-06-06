import React from "react"
import { fireEvent, render, screen } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ClineMessage } from "@roo-code/types"
import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"
import { ChatRowContent } from "../ChatRow"

const mockPostMessage = vi.fn()

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: (...args: unknown[]) => mockPostMessage(...args),
	},
}))

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const map: Record<string, string> = {
				"chat:apiRequest.sending": "Sending API request...",
			}
			return map[key] || key
		},
	}),
	Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	initReactI18next: { type: "3rdParty", init: () => {} },
}))

// Mock CodeBlock (avoid ESM/highlighter costs)
vi.mock("@src/components/common/CodeBlock", () => ({
	default: () => null,
}))

const queryClient = new QueryClient()

function createApiReqStartedMessage(options: {
	cost?: number
	cancelReason?: string
	request?: string
	streamingFailedMessage?: string
}): ClineMessage {
	const info: Record<string, unknown> = {}
	if (options.cost !== undefined) info.cost = options.cost
	if (options.cancelReason !== undefined) info.cancelReason = options.cancelReason
	if (options.request !== undefined) info.request = options.request
	if (options.streamingFailedMessage !== undefined) info.streamingFailedMessage = options.streamingFailedMessage

	return {
		type: "say",
		say: "api_req_started",
		ts: Date.now(),
		partial: false,
		text: JSON.stringify(info),
	}
}

function renderChatRow(message: ClineMessage, isExpanded = false) {
	return render(
		<ExtensionStateContextProvider>
			<QueryClientProvider client={queryClient}>
				<ChatRowContent
					message={message}
					isExpanded={isExpanded}
					isLast={false}
					isStreaming={false}
					onToggleExpand={() => {}}
					onSuggestionClick={() => {}}
					onBatchFileResponse={() => {}}
					onFollowUpUnmount={() => {}}
					isFollowUpAnswered={false}
				/>
			</QueryClientProvider>
		</ExtensionStateContextProvider>,
	)
}

describe("ChatRow - API request expand for debug", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockPostMessage.mockClear()
	})

	it("shows chevron icon when request is expandable (completed with request data)", () => {
		const requestData = JSON.stringify({ model: "claude-3", messages: [{ role: "user", content: "hello" }] })
		const message = createApiReqStartedMessage({ cost: 0.01, request: requestData })
		renderChatRow(message)

		// The chevron should be present (ChevronRight renders as an SVG)
		const svg = document.querySelector("svg")
		expect(svg).toBeTruthy()
	})

	it("does not show chevron when request is in-progress (no cost, no cancel reason)", () => {
		const requestData = JSON.stringify({ model: "claude-3" })
		const message = createApiReqStartedMessage({ request: requestData })
		renderChatRow(message)

		// No chevron should be present for in-progress requests
		const svg = document.querySelector("svg")
		expect(svg).toBeFalsy()
	})

	it("does not show chevron when request data is empty", () => {
		const message = createApiReqStartedMessage({ cost: 0.01 })
		renderChatRow(message)

		// No chevron should be present when request field is missing
		const svg = document.querySelector("svg")
		expect(svg).toBeFalsy()
	})

	it("shows cursor-pointer class when request is expandable", () => {
		const requestData = JSON.stringify({ model: "claude-3" })
		const message = createApiReqStartedMessage({ cost: 0.01, request: requestData })
		renderChatRow(message)

		// The header div should have cursor-pointer class
		const headerDiv = document.querySelector('[role="button"]')
		expect(headerDiv).toBeTruthy()
		expect(headerDiv?.className).toContain("cursor-pointer")
	})

	it("does not have role='button' when request is not expandable", () => {
		const message = createApiReqStartedMessage({})
		renderChatRow(message)

		const headerDiv = document.querySelector('[role="button"]')
		expect(headerDiv).toBeFalsy()
	})

	it("calls onToggleExpand when clicked and expandable", () => {
		const requestData = JSON.stringify({ model: "claude-3" })
		const message = createApiReqStartedMessage({ cost: 0.01, request: requestData })
		const toggleExpand = vi.fn()
		render(
			<ExtensionStateContextProvider>
				<QueryClientProvider client={queryClient}>
					<ChatRowContent
						message={message}
						isExpanded={false}
						isLast={false}
						isStreaming={false}
						onToggleExpand={toggleExpand}
						onSuggestionClick={() => {}}
						onBatchFileResponse={() => {}}
						onFollowUpUnmount={() => {}}
						isFollowUpAnswered={false}
					/>
				</QueryClientProvider>
			</ExtensionStateContextProvider>,
		)

		const headerDiv = document.querySelector('[role="button"]')
		expect(headerDiv).toBeTruthy()
		fireEvent.click(headerDiv!)
		expect(toggleExpand).toHaveBeenCalledTimes(1)
	})

	it("does not call onToggleExpand when clicked and not expandable", () => {
		const message = createApiReqStartedMessage({})
		const toggleExpand = vi.fn()
		render(
			<ExtensionStateContextProvider>
				<QueryClientProvider client={queryClient}>
					<ChatRowContent
						message={message}
						isExpanded={false}
						isLast={false}
						isStreaming={false}
						onToggleExpand={toggleExpand}
						onSuggestionClick={() => {}}
						onBatchFileResponse={() => {}}
						onFollowUpUnmount={() => {}}
						isFollowUpAnswered={false}
					/>
				</QueryClientProvider>
			</ExtensionStateContextProvider>,
		)

		// Find the header div (the one with group class)
		const headerDiv = document.querySelector(".group")
		expect(headerDiv).toBeTruthy()
		fireEvent.click(headerDiv!)
		expect(toggleExpand).not.toHaveBeenCalled()
	})

	it("shows expanded JSON content when isExpanded is true", () => {
		const requestPayload = { model: "claude-3", messages: [{ role: "user", content: "hello" }] }
		const requestData = JSON.stringify(requestPayload)
		const message = createApiReqStartedMessage({ cost: 0.01, request: requestData })
		renderChatRow(message, true)

		// The formatted JSON should be displayed
		const preElement = document.querySelector("pre")
		expect(preElement).toBeTruthy()
		expect(preElement?.textContent).toContain('"model": "claude-3"')
		expect(preElement?.textContent).toContain('"role": "user"')
	})

	it("does not show expanded JSON content when isExpanded is false", () => {
		const requestData = JSON.stringify({ model: "claude-3" })
		const message = createApiReqStartedMessage({ cost: 0.01, request: requestData })
		renderChatRow(message, false)

		const preElement = document.querySelector("pre")
		expect(preElement).toBeFalsy()
	})

	it("handles Enter key press to toggle expansion", () => {
		const requestData = JSON.stringify({ model: "claude-3" })
		const message = createApiReqStartedMessage({ cost: 0.01, request: requestData })
		const toggleExpand = vi.fn()
		render(
			<ExtensionStateContextProvider>
				<QueryClientProvider client={queryClient}>
					<ChatRowContent
						message={message}
						isExpanded={false}
						isLast={false}
						isStreaming={false}
						onToggleExpand={toggleExpand}
						onSuggestionClick={() => {}}
						onBatchFileResponse={() => {}}
						onFollowUpUnmount={() => {}}
						isFollowUpAnswered={false}
					/>
				</QueryClientProvider>
			</ExtensionStateContextProvider>,
		)

		const headerDiv = document.querySelector('[role="button"]')
		expect(headerDiv).toBeTruthy()
		fireEvent.keyDown(headerDiv!, { key: "Enter" })
		expect(toggleExpand).toHaveBeenCalledTimes(1)
	})

	it("handles Space key press to toggle expansion", () => {
		const requestData = JSON.stringify({ model: "claude-3" })
		const message = createApiReqStartedMessage({ cost: 0.01, request: requestData })
		const toggleExpand = vi.fn()
		render(
			<ExtensionStateContextProvider>
				<QueryClientProvider client={queryClient}>
					<ChatRowContent
						message={message}
						isExpanded={false}
						isLast={false}
						isStreaming={false}
						onToggleExpand={toggleExpand}
						onSuggestionClick={() => {}}
						onBatchFileResponse={() => {}}
						onFollowUpUnmount={() => {}}
						isFollowUpAnswered={false}
					/>
				</QueryClientProvider>
			</ExtensionStateContextProvider>,
		)

		const headerDiv = document.querySelector('[role="button"]')
		expect(headerDiv).toBeTruthy()
		fireEvent.keyDown(headerDiv!, { key: " " })
		expect(toggleExpand).toHaveBeenCalledTimes(1)
	})

	it("has aria-expanded attribute when expandable", () => {
		const requestData = JSON.stringify({ model: "claude-3" })
		const message = createApiReqStartedMessage({ cost: 0.01, request: requestData })
		renderChatRow(message, true)

		const headerDiv = document.querySelector('[role="button"]')
		expect(headerDiv).toBeTruthy()
		expect(headerDiv?.getAttribute("aria-expanded")).toBe("true")
	})

	it("has tabIndex=0 when expandable for keyboard navigation", () => {
		const requestData = JSON.stringify({ model: "claude-3" })
		const message = createApiReqStartedMessage({ cost: 0.01, request: requestData })
		renderChatRow(message)

		const headerDiv = document.querySelector('[role="button"]')
		expect(headerDiv).toBeTruthy()
		expect(headerDiv?.getAttribute("tabindex")).toBe("0")
	})

	it("is expandable when request has cancelReason but no cost", () => {
		const requestData = JSON.stringify({ model: "claude-3" })
		const message = createApiReqStartedMessage({ cancelReason: "user_cancelled", request: requestData })
		const toggleExpand = vi.fn()
		render(
			<ExtensionStateContextProvider>
				<QueryClientProvider client={queryClient}>
					<ChatRowContent
						message={message}
						isExpanded={false}
						isLast={false}
						isStreaming={false}
						onToggleExpand={toggleExpand}
						onSuggestionClick={() => {}}
						onBatchFileResponse={() => {}}
						onFollowUpUnmount={() => {}}
						isFollowUpAnswered={false}
					/>
				</QueryClientProvider>
			</ExtensionStateContextProvider>,
		)

		const headerDiv = document.querySelector('[role="button"]')
		expect(headerDiv).toBeTruthy()
		fireEvent.click(headerDiv!)
		expect(toggleExpand).toHaveBeenCalledTimes(1)
	})
})
