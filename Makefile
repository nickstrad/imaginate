.PHONY: run/inngest
run/inngest:
	npx inngest-cli@latest dev

.PHONY: run/all
run/all:
	npx mprocs


.PHONY: db/local/up
# Local-only: starts the Docker Compose Postgres used by local development.
db/local/up:
	docker compose up postgres

.PHONY: db/local/down
# Local-only: stops local Docker Compose services without deleting database data.
db/local/down:
	docker compose down

.PHONY: db/local/logs
# Local-only: follows logs for the local Docker Compose Postgres service.
db/local/logs:
	docker compose logs -f postgres

.PHONY: db/local/status
# Local-only: shows local Docker Compose service status.
db/local/status:
	docker compose ps

.PHONY: db/local/verify
# Local-only: verifies .env, Docker Compose, Prisma schema, and DB connectivity.
db/local/verify:
	node scripts/verify-local-db.mjs

.PHONY: db/local/reset
# Local/dev-only: resets whichever database DATABASE_URL points at. Never use against prod.
db/local/reset:
	npx prisma migrate reset

.PHONY: db/local/migrate
# Local/dev-only: applies development migrations and may create migration files.
db/local/migrate:
	npx prisma migrate dev

.PHONY: db/prod/migrate
# Prod-only: deploys already-committed migrations to the DATABASE_URL target.
db/prod/migrate:
	npx prisma migrate deploy

.PHONY: db/local/wipe
# Local-only destructive reset: removes local Docker Compose database volumes.
db/local/wipe:
	docker compose down --volumes --remove-orphans

.PHONY: db/local/rebuild
# Local-only destructive prep: use when schema/migration changes appear stuck or
# when you intentionally want a completely fresh local database volume.
db/local/rebuild: db/local/wipe
	@printf "Local database volume removed.\n"
	@printf "Run 'make db/local/up' in one terminal, then 'make db/local/migrate' in another.\n"

.PHONY: db/local/fresh
db/local/fresh: db/local/rebuild

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
