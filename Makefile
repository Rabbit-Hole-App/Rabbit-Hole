clean:
	bash run.sh clean

install:
	bash run.sh install

lint:
	bash run.sh lint

lint-ci:
	bash run.sh lint:ci

test:
	bash run.sh run-tests

help:
	bash run.sh help

generate-project:
	bash run.sh generate-project