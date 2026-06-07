import React from "react"

import { render, screen } from "@/utils/test-utils"

import Announcement from "../Announcement"

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("@roo/package", () => ({
	Package: {
		version: "3.53.0",
	},
}))

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeLink: ({ children, href, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a href={href} onClick={onClick} {...props}>
			{children}
		</a>
	),
}))

vi.mock("react-i18next", () => ({
	Trans: ({ i18nKey }: { i18nKey: string }) => {
		return <span>{i18nKey}</span>
	},
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, options?: { version?: string }) => {
			const translations: Record<string, string> = {
				"chat:announcement.finalRelease.title": "airiOS Code 3.53.0 Released",
				"chat:announcement.finalRelease.intro":
					"This release brings powerful new capabilities to airiOS Code.",
				"chat:announcement.finalRelease.feature1":
					"Swarm Architecture: Structured multi-agent coordination with crash recovery, intent avoidance, and semantic conflict detection.",
				"chat:announcement.finalRelease.feature2":
					"Semantic Loop Detection: Identifies reasoning loops and wandering behaviors, auto-condensing context on model switch.",
				"chat:announcement.finalRelease.feature3":
					"Asynchronous Subtasks (Alpha): Concurrent parallel task execution with automatic git worktree merging.",
				"chat:announcement.finalRelease.feature4":
					"Spec-driven development: Kiro-style Spec mode replacing Architect mode for better planning.",
				"chat:announcement.finalRelease.continuity":
					"airiOS Code continues to evolve with new features, model provider updates, and community contributions. Stay tuned for more!",
				"chat:announcement.finalRelease.alternatives":
					"Explore the full feature set including Vibe, Spec, Ask, Debug, and Custom modes, MCP support, and the new Tools Control settings panel.",
				"chat:announcement.finalRelease.signoff": "Happy coding!",
			}

			if (key === "chat:announcement.finalRelease.title") {
				return `${translations[key]}${options?.version ? "" : ""}`
			}

			return translations[key] ?? key
		},
	}),
}))

describe("Announcement", () => {
	it("renders the new features announcement", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(screen.getByText("airiOS Code 3.53.0 Released")).toBeInTheDocument()
		expect(
			screen.getByText("This release brings powerful new capabilities to airiOS Code."),
		).toBeInTheDocument()
		expect(
			screen.getByText(
				"airiOS Code continues to evolve with new features, model provider updates, and community contributions. Stay tuned for more!",
			),
		).toBeInTheDocument()
		expect(screen.getByText("Happy coding!")).toBeInTheDocument()
	})

	it("renders feature highlights", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(screen.getByText(/Swarm Architecture/)).toBeInTheDocument()
		expect(screen.getByText(/Semantic Loop Detection/)).toBeInTheDocument()
		expect(screen.getByText(/Asynchronous Subtasks/)).toBeInTheDocument()
		expect(screen.getByText(/Spec-driven development/)).toBeInTheDocument()
	})

	it("renders the alternatives text", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(
			screen.getByText(
				/Explore the full feature set including Vibe, Spec, Ask, Debug, and Custom modes/,
			),
		).toBeInTheDocument()
	})
})
