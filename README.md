# iCode

Autonomous AI coding IDE orchestrated by LLMs, integrated directly into VS Code.

## Features

- **Multi-Agent Support:** Easily start sessions with Claude and Gemini.
- **Interactive Task Panel:** Manage AI agent tasks through a dedicated sidebar.
- **Terminal Integration:** Agents run in integrated VS Code terminals for full transparency and control.
- **Built-in Diff View:** Review changes made by agents before accepting them.
- **Yolo Mode:** Optional mode to skip permission prompts for faster iteration.

## Extension Settings

This extension contributes the following settings:

* `icode.agents.claude.command`: Path or command to invoke the Claude CLI.
* `icode.agents.gemini.command`: Path or command to invoke the Gemini CLI.
* `icode.yolo`: Enable/disable Yolo mode for all agents.

## Known Issues

- Initial setup requires the Claude and Gemini CLIs to be installed on your system path.

## Release Notes

### 0.0.1

Initial release of iCode VS Code extension.
