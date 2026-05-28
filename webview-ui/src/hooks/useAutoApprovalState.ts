import { useMemo } from "react"

interface AutoApprovalToggles {
	alwaysAllowReadOnly?: boolean
	alwaysAllowWrite?: boolean
	alwaysAllowExecute?: boolean
	alwaysAllowMcp?: boolean
	alwaysAllowModeSwitch?: boolean
	alwaysAllowSubtasks?: boolean
	alwaysAllowFollowupQuestions?: boolean
	modeSwitchingEnabled?: boolean
}

export function useAutoApprovalState(toggles: AutoApprovalToggles, autoApprovalEnabled?: boolean) {
	const hasEnabledOptions = useMemo(() => {
		const { modeSwitchingEnabled: _, ...actualToggles } = toggles
		return Object.values(actualToggles).some((value) => !!value)
	}, [toggles])

	const effectiveAutoApprovalEnabled = useMemo(() => {
		return autoApprovalEnabled ?? false
	}, [autoApprovalEnabled])

	return {
		hasEnabledOptions,
		effectiveAutoApprovalEnabled,
	}
}
