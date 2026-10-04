# On Windows, bash is not on PATH in PowerShell/cmd — derive it from git's install dir.
# ponytail: breaks if git lives under a path with spaces; set BASH=... manually then.
ifeq ($(OS),Windows_NT)
# inside git-bash, bash is already on PATH; from PowerShell/cmd derive it from git's dir (cmd\ or mingw64\bin\ layout)
# 2>/dev/null not 2>NUL: make's $(shell) runs through sh, where NUL is a regular file
BASH := $(if $(shell where bash 2>/dev/null),bash,$(subst mingw64\bin\git.exe,bin\bash.exe,$(subst cmd\git.exe,bin\bash.exe,$(word 1,$(shell where git)))))
else
BASH := bash
endif

clean:
	$(BASH) run.sh clean

test:
	$(BASH) run.sh run-tests

help:
	$(BASH) run.sh help

# ---------- small-deploy ----------
# DIR defaults to examples/counter; override: make deploy DIR=examples/my-tool

DIR ?= examples/counter

run-local:
	$(BASH) run.sh run-local $(DIR)

run-guarded:
	$(BASH) run.sh run-guarded $(DIR)

login:
	$(BASH) run.sh login

deploy:
	$(BASH) run.sh deploy $(DIR)

share:
	$(BASH) run.sh share $(EMAIL) $(DIR)

logs:
	$(BASH) run.sh logs

test-unit:
	$(BASH) run.sh test:unit

test-integration:
	$(BASH) run.sh test:integration

cp-deploy:
	$(BASH) run.sh cp:deploy

web-dev:
	$(BASH) run.sh web:dev

web-deploy:
	$(BASH) run.sh web:deploy

web-test:
	$(BASH) run.sh web:test

cp-tail:
	$(BASH) run.sh cp:tail

publish-cli:
	$(BASH) run.sh publish:cli

publish-skill:
	$(BASH) run.sh publish:skill

skill-mirror:
	$(BASH) run.sh skill:mirror

# ---------- dev clone secrets ----------
# $(call fly_secret_to_clone,<fly app>,<secret name>,<worker clone>): read a secret from a running Fly
# machine and upload it to a rabbit-hole-web-dev-<name> worker clone, printing only its length.
# Refuses the shared small-cp-dev worker and anything that is not a clone. wrangler secret put can create a missing
# Worker, so only the Rabbit Hole clone prefix is accepted: no new small-* Worker (owner, 2026-10-04).
define fly_secret_to_clone
$(BASH) -c 'case "$(3)" in rabbit-hole-web-dev-?*) ;; *) echo "refusing: $(3) is not a rabbit-hole-web-dev-<name> clone"; exit 1;; esac; t=$$($(FLY) ssh console -q -a $(1) -C "printenv $(2)" | tr -d "\r\n"); if [ -z "$$t" ]; then echo "empty $(2) from $(1)"; exit 1; fi; echo "$(2) length: $${#t}"; cd packages/web && printf "%s" "$$t" | npx wrangler secret put $(2) --config wrangler.dev.jsonc --name $(3)'
endef

# The clone defaults to this worktree's own (CLAUDE.md: rabbit-hole-web-dev-<worktree name>).
CLONE ?= rabbit-hole-web-dev-$(notdir $(CURDIR))
# Installs put flyctl on PATH, not always a fly alias.
FLY ?= flyctl

# The lesson renderer's bearer token, needed by repository imports and branch lookups on a clone.
clone-scene-token:
	$(call fly_secret_to_clone,rabbit-hole-lesson-renderer-dev,SCENE_WORKER_TOKEN,$(CLONE))
