.PHONY: verify

verify:
	npm run lint
	npm run typecheck
	npm test
