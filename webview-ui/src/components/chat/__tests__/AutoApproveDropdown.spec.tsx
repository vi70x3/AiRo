import { render, screen, fireEvent } from "@/utils/test-utils"
import { AutoApproveDropdown } from "../AutoApproveDropdown"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAutoApprovalToggles } from "@/hooks/useAutoApprovalToggles"
import { useAutoApprovalState } from "@/hooks/useAutoApprovalState"
import { vscode } from "@/utils/vscode"
import React from "react"

vi.mock("@/context/ExtensionStateContext")
vi.mock("@/hooks/useAutoApprovalToggles")
vi.mock("@/hooks/useAutoApprovalState")
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, options?: any) => (options?.count !== undefined ? `${key} (${options.count})` : key),
	}),
}))
vi.mock("@/components/ui/hooks/useRooPortal", () => ({
	useRooPortal: () => null,
}))
vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

const mockToggles = {
	alwaysAllowReadOnly: true,
	alwaysAllowWrite: true,
	alwaysAllowExecute: false,
	alwaysAllowMcp: false,
	alwaysAllowModeSwitch: true,
	alwaysAllowSubtasks: false,
	alwaysAllowFollowupQuestions: false,
	modeSwitchingEnabled: true,
}

describe("AutoApproveDropdown", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		
		vi.mocked(useExtensionState).mockReturnValue({
			autoApprovalEnabled: true,
			setAutoApprovalEnabled: vi.fn(),
			setAlwaysAllowReadOnly: vi.fn(),
			setAlwaysAllowWrite: vi.fn(),
			setAlwaysAllowExecute: vi.fn(),
			setAlwaysAllowMcp: vi.fn(),
			setAlwaysAllowModeSwitch: vi.fn(),
			setAlwaysAllowSubtasks: vi.fn(),
			setAlwaysAllowFollowupQuestions: vi.fn(),
		} as any)

		vi.mocked(useAutoApprovalToggles).mockReturnValue(mockToggles as any)

		vi.mocked(useAutoApprovalState).mockReturnValue({
			effectiveAutoApprovalEnabled: true,
		} as any)
	})

	test("renders mode switch toggle when modeSwitchingEnabled is true", () => {
		render(<AutoApproveDropdown />)

		// Click to open popover
		fireEvent.click(screen.getByTestId("auto-approve-dropdown-trigger"))

		expect(screen.getByTestId("auto-approve-alwaysAllowModeSwitch")).toBeInTheDocument()
		expect(screen.getByTestId("auto-approve-dropdown-trigger")).toHaveTextContent("chat:autoApprove.triggerLabel (3)")
	})

	test("hides mode switch toggle when modeSwitchingEnabled is false", () => {
		vi.mocked(useAutoApprovalToggles).mockReturnValue({
			...mockToggles,
			modeSwitchingEnabled: false,
		} as any)

		render(<AutoApproveDropdown />)

		fireEvent.click(screen.getByTestId("auto-approve-dropdown-trigger"))

		expect(screen.queryByTestId("auto-approve-alwaysAllowModeSwitch")).not.toBeInTheDocument()
		expect(screen.getByTestId("auto-approve-dropdown-trigger")).toHaveTextContent("chat:autoApprove.triggerLabel (2)")
	})

	test("Select All only affects visible toggles when modeSwitchingEnabled is false", () => {
		vi.mocked(useAutoApprovalToggles).mockReturnValue({
			...mockToggles,
			modeSwitchingEnabled: false,
		} as any)

		render(<AutoApproveDropdown />)

		fireEvent.click(screen.getByTestId("auto-approve-dropdown-trigger"))

		fireEvent.click(screen.getByLabelText("chat:autoApprove.selectAll"))

		// Check vscode.postMessage calls
		const postMessageCalls = vi.mocked(vscode.postMessage).mock.calls
		
		// Should NOT have called for alwaysAllowModeSwitch
		const modeSwitchCall = postMessageCalls.find((call) => {
			const msg = call[0]
			return msg.type === "updateSettings" && msg.updatedSettings?.alwaysAllowModeSwitch !== undefined
		})
		expect(modeSwitchCall).toBeUndefined()

		// Should have called for alwaysAllowExecute (which was false)
		const executeCall = postMessageCalls.find((call) => {
			const msg = call[0]
			return msg.type === "updateSettings" && msg.updatedSettings?.alwaysAllowExecute === true
		})
		expect(executeCall).toBeDefined()
	})
})
