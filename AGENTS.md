## How to work in this repo
- Strictly make as entry point to invoke all targets, runtime and test.
- Operate only inside this pwd unless explicitly told otherwise (PWD rules apply).
- Read the Makefile first before using any tools or adding targets.
- Call `make digest` to understand the codebase; it is the sanctioned way to learn the structure.
- All execution happens via make; add or adjust Make targets rather than invoking tools or scripts directly.

## Architectural alignment
- Align with the existing architecture. Reuse what is here; do not reframe components.
- Do not add modules (files, packages, services) unless explicitly approved by the operator.
- The stub worker and spawner are the only additions needed for this milestone, routed through the Makefile.

## Principles (Prime directives)
- YAGNI - build only what this stub needs.
- DRY - if something exists, reuse it.
- KISS - keep it straightforward; no optional branches or toggles.
- No fallbacks - they hide failures; let issues surface immediately.

## Agent tmux panes
- Use `make agent TARGET=<target>` to run any make target in a tmux pane (e.g., `TARGET=worker` or `TARGET=play-llm`).
- Must be run inside an existing tmux session; the target fails fast otherwise.
- Splits a pane above the current one with height set by `AGENT_PANE_PERCENT` (default 45) and titles it with the target name.
- Prints a header, runs `make <target>`, then prints the exit status and keeps the pane open until Enter is pressed.
- Capture logs later with `tmux capture-pane -pt <pane-id>`.
- Continue to route all execution through make; never call runtime tools directly.
