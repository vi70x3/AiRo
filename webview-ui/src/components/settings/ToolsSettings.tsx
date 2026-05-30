import { HTMLAttributes } from "react"
import { AlertTriangle } from "lucide-react"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

import {
	type ToolName,
	toolGroupConfig,
	toolDisplayNames,
	criticalToolNames,
} from "@roo-code/types"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { SearchableSetting } from "./SearchableSetting"

type ToolsSettingsProps = HTMLAttributes<HTMLDivElement> & {
	disabledTools?: string[]
	setCachedStateField: SetCachedStateField<"disabledTools">
}

export const ToolsSettings = ({ disabledTools, setCachedStateField, ...props }: ToolsSettingsProps) => {
	const { t } = useAppTranslation()
	const safeDisabledTools = disabledTools ?? []

	const handleToggleTool = (toolName: ToolName, checked: boolean) => {
		const currentDisabledTools = [...safeDisabledTools]
		if (!checked) {
			// Disable tool: add to disabledTools if not already there
			if (!currentDisabledTools.includes(toolName)) {
				currentDisabledTools.push(toolName)
			}
		} else {
			// Enable tool: remove from disabledTools
			const index = currentDisabledTools.indexOf(toolName)
			if (index !== -1) {
				currentDisabledTools.splice(index, 1)
			}
		}
		setCachedStateField("disabledTools", currentDisabledTools as ToolName[])
	}

	return (
		<div {...props}>
			<SectionHeader>{t("settings:sections.tools")}</SectionHeader>

			<Section>
				<div className="text-vscode-descriptionForeground text-sm mb-4">
					{t("settings:tools.description")}
				</div>

				<div className="space-y-6">
					{toolGroupConfig.map((group) => (
						<div key={group.groupKey} className="space-y-3">
							<h4 className="text-vscode-foreground font-bold flex items-center gap-2 m-0 uppercase text-xs opacity-70 tracking-wider">
								{t(group.labelKey)}
							</h4>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								{group.tools.map((toolName) => {
									const isEnabled = !safeDisabledTools.includes(toolName)
									const isCritical = criticalToolNames.includes(toolName)

									return (
										<SearchableSetting
											key={toolName}
											settingId={`tool-${toolName}`}
											section="tools"
											label={toolDisplayNames[toolName] || toolName}>
											<div className="flex flex-col gap-1">
												<VSCodeCheckbox
													checked={isEnabled}
													onChange={(e: any) => handleToggleTool(toolName, e.target.checked)}>
													<span className="font-medium">
														{toolDisplayNames[toolName] || toolName}
													</span>
												</VSCodeCheckbox>
												{isCritical && !isEnabled && (
													<div className="flex items-center gap-1.5 text-yellow-500 text-xs ml-6">
														<AlertTriangle className="w-3.5 h-3.5" />
														<span>{t("settings:tools.warning.critical")}</span>
													</div>
												)}
											</div>
										</SearchableSetting>
									)
								})}
							</div>
						</div>
					))}
				</div>
			</Section>
		</div>
	)
}
