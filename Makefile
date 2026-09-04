# On Windows, bash is not on PATH in PowerShell/cmd — derive it from git's install dir.
# ponytail: breaks if git lives under a path with spaces; set BASH=... manually then.
ifeq ($(OS),Windows_NT)
# inside git-bash, bash is already on PATH; from PowerShell/cmd derive it from git's dir
BASH := $(if $(shell where bash 2>NUL),bash,$(subst cmd\git.exe,bin\bash.exe,$(word 1,$(shell where git))))
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

cp-tail:
	$(BASH) run.sh cp:tail

publish-cli:
	$(BASH) run.sh publish:cli
