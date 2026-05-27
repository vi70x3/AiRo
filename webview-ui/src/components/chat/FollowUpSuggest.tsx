import { useCallback, useState } from "react"
import { ClipboardCopy } from "lucide-react"

import { Button, StandardTooltip } from "@/components/ui"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { SuggestionItem } from "@roo-code/types"
import { cn } from "@/lib/utils"

interface FollowUpSuggestProps {
	suggestions?: SuggestionItem[]
	onSuggestionClick?: (suggestion: SuggestionItem, event?: React.MouseEvent) => void
	ts: number
	onCancelAutoApproval?: () => void
	isAnswered?: boolean
	isFollowUpAutoApprovalPaused?: boolean
}

export const FollowUpSuggest = ({
	suggestions = [],
	onSuggestionClick,
	ts = 1,
	isAnswered = false,
}: FollowUpSuggestProps) => {
	const [suggestionSelected, setSuggestionSelected] = useState(false)
	const { t } = useAppTranslation()

	const handleSuggestionClick = useCallback(
		(suggestion: SuggestionItem, event: React.MouseEvent) => {
			if (!event.shiftKey) {
				setSuggestionSelected(true)
			}

			onSuggestionClick?.(suggestion, event)
		},
		[onSuggestionClick],
	)

	// Don't render if there are no suggestions or no click handler.
	if (!suggestions?.length || !onSuggestionClick) {
		return null
	}

	return (
		<div className="flex mb-2 flex-col h-full gap-2">
			{suggestions.map((suggestion, index) => {
				return (
					<div key={`${suggestion.answer}-${ts}`} className="w-full relative group">
						<Button
							variant="outline"
							className={cn(
								"text-left whitespace-normal break-words w-full h-auto px-3 py-2 justify-start pr-8 rounded-xl",
							)}
							onClick={(event) => handleSuggestionClick(suggestion, event)}
							aria-label={suggestion.answer}>
							{suggestion.answer}
						</Button>
						{suggestion.mode && (
							<div className="absolute bottom-0 right-0 text-[10px] text-vscode-badge-foreground pl-1 pr-2.5 pt-0.5 pb-1.5 flex items-center gap-0.5 bg-transparent rounded-xl">
								<span className="codicon codicon-arrow-right" style={{ fontSize: "8px" }} />
								{suggestion.mode}
							</div>
						)}
						<StandardTooltip content={t("chat:followUpSuggest.copyToInput")}>
							<div
								className="absolute cursor-pointer top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-vscode-input-background px-0.5 rounded"
								onClick={(e) => {
									e.stopPropagation()
									setSuggestionSelected(true)
									onSuggestionClick?.(suggestion, { ...e, shiftKey: true })
								}}>
								<ClipboardCopy className="w-4" />
							</div>
						</StandardTooltip>
					</div>
				)
			})}
		</div>
	)
}
