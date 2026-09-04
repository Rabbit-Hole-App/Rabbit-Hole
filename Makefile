clean:
	bash run.sh clean

test:
	bash run.sh run-tests

help:
	bash run.sh help

# ---------- small-deploy ----------
# DIR defaults to examples/counter; override: make deploy DIR=examples/my-tool

DIR ?= examples/counter

run-local:
	bash run.sh run-local $(DIR)

run-guarded:
	bash run.sh run-guarded $(DIR)

login:
	bash run.sh login

deploy:
	bash run.sh deploy $(DIR)

share:
	bash run.sh share $(EMAIL) $(DIR)

logs:
	bash run.sh logs

test-unit:
	bash run.sh test:unit

test-integration:
	bash run.sh test:integration

cp-deploy:
	bash run.sh cp:deploy

cp-tail:
	bash run.sh cp:tail

publish-cli:
	bash run.sh publish:cli