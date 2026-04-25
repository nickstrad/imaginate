.PHONY: run/inngest
run/inngest:
	npx inngest-cli@latest dev

.PHONY: run/all
run/all:
	npx mprocs


.PHONY: db/reset
db/reset:
	npx prisma migrate reset

.PHONY: db/migrate
db/migrate:
	npx prisma migrate dev

.PHONY: run/prisma
run/prisma:
	npx prisma studio

# Rebuild the E2B sandbox template after changing sandbox-templates/nextjs or
# when the hosted template needs a newer envd for snapshot support. Use the v2
# create command instead of template build because the checked-in e2b.toml is a
# legacy v1 config and routes builds through the deprecated Docker registry flow.
.PHONY: sandbox/build
sandbox/build:
	npx --yes @e2b/cli@latest template create imaginate-dev --path sandbox-templates/nextjs --cmd /compile_page.sh --ready-cmd "curl -fsS http://localhost:3000 >/dev/null"