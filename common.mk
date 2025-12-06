.PHONY: digest ingest clean agent

define success
	@printf '\033[32m\n'; \
	set -- 🕵️ 🔒 📡 🗝️ 🥃; \
	icon_idx=$$(( $$(od -An -N2 -tu2 /dev/urandom | tr -d ' ') % $$# + 1 )); \
	while [ $$icon_idx -gt 1 ]; do shift; icon_idx=$$((icon_idx - 1)); done; \
	icon=$$1; \
	parent_info=$$(ps -o ppid= -p $$$$ 2>/dev/null | tr -d ' '); \
	[ -n "$$parent_info" ] || parent_info="n/a"; \
	printf "%s > \033[33m%s\033[0m accomplished\n" "$$icon" "$(@)"; \
	printf "\033[90m{{{ %s | user=%s | host=%s | procid=%s | parentproc=%s }}}\033[0m\n\033[0m" "$$(date +%Y-%m-%d_%H:%M:%S)" "$$(whoami)" "$$(hostname)" "$$$$" "$$parent_info"
endef

.venv/: requirements.txt
	uv venv .venv/
	uv pip install -r requirements.txt
	$(call success)

AGENT_PANE_PERCENT ?= 45

# Run a command in a tmux pane with a header/footer.
# Usage: $(call agent_pane,<label>,<command...>)
define agent_pane
	@if ! command -v tmux >/dev/null 2>&1; then \
		echo "tmux is required to run $(1) in agent mode." >&2; \
		exit 1; \
	fi; \
	if [ -z "$$TMUX" ]; then \
		echo "make agent must be run inside a tmux session." >&2; \
		exit 1; \
	fi; \
	pane_label="$(1)"; \
	repo_root="$(CURDIR)"; \
	pane_height="$${AGENT_PANE_PERCENT:-45}"; \
	cmd_display="$$(printf ' %q' $(2))"; \
	cmd_display="$${cmd_display# }"; \
	pane_id="$$( \
		tmux split-window -b -v -p "$$pane_height" -c "$$repo_root" -PF '#{pane_id}' \
			bash -lc ' \
				printf "\033]2;%s\007" "$$0"; \
				echo "[agent:$$0] Running $$1"; \
				echo; \
				eval "$$1"; \
				status=$$?; \
				echo; \
				echo "[agent:$$0] Command exited with status $$status"; \
				echo "Pane will stay open for review. Press ENTER to close it."; \
				if [ -t 0 ]; then read -r _ || true; else while :; do sleep 3600; done; fi; \
				exit $$status; \
			' "$$pane_label" "$$cmd_display" \
	)"; \
	echo "Started tmux pane $$pane_id for $$pane_label"; \
	echo "Command: $$cmd_display"; \
	echo "To capture output: tmux capture-pane -pt $$pane_id"
endef

.PHONY: agent
agent:
	@if [ -z "$(TARGET)" ]; then \
		echo "Usage: make agent TARGET=<other-make-target>" >&2; \
		echo "Example: make agent TARGET=worker" >&2; \
		exit 1; \
	fi
	$(call agent_pane,$(TARGET),$(MAKE) $(TARGET))

digest:
	@echo "=== Project Digest ==="
	@for file in $$(find . -path "./.uv-cache" -prune -o -type f \( -name "*.py" -o -name "*.md" -o -name "*.txt" -o -name "*.mk" -o -name "Makefile" \) -print | grep -v venv | grep -v __pycache__ | sort); do \
		echo ""; \
		echo "--- $$file ---"; \
		cat "$$file"; \
	done
	$(call success)

ingest:
	$(MAKE) digest | pbcopy
	$(call success)

clean:
	rm -Rf .venv/
	$(call success)
