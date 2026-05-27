import React, { useState, useMemo } from "react"
import { Check, CheckCheck, ChevronUp } from "lucide-react"
import { cn } from "../../lib/utils"
import { useTranslation } from "react-i18next"
import { StandardTooltip } from "../ui/standard-tooltip"

interface CommandPattern {
	pattern: string
	description?: string
}

interface CommandPatternSelectorProps {
	patterns{
