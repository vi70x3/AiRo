<p align="center">
  <a href="https://github.com/vi70x3/airoo/releases"><img src="https://img.shields.io/github/downloads/vi70x3/airoo/total?style=flat&logo=vscode
" alt="Latest Nightly Release"></a>  
</p>

# AiRoo Code

### SECURITY NOTICE This fork focuses on full automation by default so consider running it in isolated code-server or a graphical container

## How Is This Fork Different:
- [x] (alpha) implements new `async_task` tols for asyncronyous subtasks execution with each subtask popping up in new editor tab (utilizes existing worktrees support with auto-merging after all subtasks are complete) 
- [x] removes `Roo is having trouble` (this was really bad for any kind of automation)
- [x] gates agent mode-switch requests behind a master toggle in settings (also bad for carefully designed automation)
- [x] separates modes / models per instance (multiple AiRoo tabs in same window when you click `...` -> `Open in editor`)
- [x] allows full YOLO by default (you're not having trust issues with your cyber waifu aren't you?)
- [ ] [vi70x3/airi](https://github.com/vi70x3/airi) integration:
  - [ ] add AiRoo context snapshot to each AIRI heartbeat

---

## What Can AiRoo Code Do For YOU?

- Generate Code from natural language descriptions and specs
- Adapt with Modes: Code, Architect, Ask, Debug, and Custom Modes
- Refactor & Debug existing code
- Write & Update documentation
- Answer Questions about your codebase
- Automate repetitive tasks
- Utilize MCP Servers

## Modes

AiRoo Code adapts to how you work:

- Code Mode: everyday coding, edits, and file ops
- Architect Mode: plan systems, specs, and migrations
- Ask Mode: fast answers, explanations, and docs
- Debug Mode: trace issues, add logs, isolate root causes
- Custom Modes: build specialized modes for your team or workflow

Learn more: [Using Modes](https://roocodeinc.github.io/Roo-Code/basic-usage/using-modes) • [Custom Modes](https://roocodeinc.github.io/Roo-Code/advanced-usage/custom-modes)

## Resources

- **[Documentation](https://roocodeinc.github.io/AiRoo-Code/):** The official guide to installing, configuring, and mastering AiRoo Code.

