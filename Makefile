# Makefile for assistant app (backend + frontend + db)
# Uses service names from docker-compose.yml:
#   services: db, backend, frontend

DC               := docker compose
BACKEND_SERVICE  := backend
FRONTEND_SERVICE := frontend
DB_SERVICE       := db

# Django manage.py helper (inside backend service)
MANAGE           := $(DC) exec $(BACKEND_SERVICE) python manage.py

# Postgres DB name/user (MATCHES your .env)
DB_NAME := assistant_db
DB_USER := assistant_user

.PHONY: help \
        up down restart logs logs-backend logs-frontend logs-db \
        backend-bash backend-shell backend-makemigrations backend-migrate backend-createsuperuser \
        frontend-bash frontend-install frontend-start frontend-build \
        flushdb dropdb resetdb db-up db-down

help:
	@echo ""
	@echo "Assistant app Makefile commands"
	@echo "--------------------------------"
	@echo "Project lifecycle:"
	@echo "  make up                 - Start all services (backend, frontend, db)"
	@echo "  make down               - Stop all services"
	@echo "  make restart            - Restart all services"
	@echo "  make logs               - Follow combined logs"
	@echo "  make logs-backend       - Follow backend logs"
	@echo "  make logs-frontend      - Follow frontend logs"
	@echo "  make logs-db            - Follow database logs"
	@echo ""
	@echo "Backend (Django):"
	@echo "  make backend-bash       - Open bash in backend container"
	@echo "  make backend-shell      - Open Django shell"
	@echo "  make backend-makemigrations - Run makemigrations"
	@echo "  make backend-migrate    - Run migrate"
	@echo "  make backend-createsuperuser - Create Django superuser (interactive)"
	@echo ""
	@echo "Database:"
	@echo "  make db-up              - Start ONLY the db service"
	@echo "  make db-down            - Stop ONLY the db service"
	@echo "  make flushdb            - Flush Django DB (drop all data, keep schema)"
	@echo "  make dropdb             - DROP DATABASE (DB_NAME=$(DB_NAME), DB_USER=$(DB_USER))"
	@echo "  make resetdb            - Hard reset: drop DB -> create DB -> migrate"
	@echo ""
	@echo "Frontend:"
	@echo "  make frontend-bash      - Open shell in frontend container"
	@echo "  make frontend-install   - Install frontend deps (npm/yarn)"
	@echo "  make frontend-start     - Start frontend dev server"
	@echo "  make frontend-build     - Build frontend production bundle"
	@echo ""

# --- Project lifecycle ---

up:
	$(DC) up -d

down:
	$(DC) down

restart: down up

logs:
	$(DC) logs -f

logs-backend:
	$(DC) logs -f $(BACKEND_SERVICE)

logs-frontend:
	$(DC) logs -f $(FRONTEND_SERVICE)

logs-db:
	$(DC) logs -f $(DB_SERVICE)

# --- Backend helpers (Django) ---

backend-bash:
	@echo "Opening shell in backend service $(BACKEND_SERVICE)..."
	$(DC) exec $(BACKEND_SERVICE) bash || $(DC) exec $(BACKEND_SERVICE) sh

backend-shell:
	@echo "Opening Django shell..."
	$(MANAGE) shell

backend-makemigrations:
	@echo "Running makemigrations..."
	$(MANAGE) makemigrations

backend-migrate:
	@echo "Running migrate..."
	$(MANAGE) migrate

backend-createsuperuser:
	@echo "Creating Django superuser (interactive)..."
	$(MANAGE) createsuperuser

# --- Database helpers ---

db-up:
	@echo "Starting database service $(DB_SERVICE)..."
	$(DC) up -d $(DB_SERVICE)

db-down:
	@echo "Stopping database service $(DB_SERVICE)..."
	$(DC) stop $(DB_SERVICE)

flushdb:
	@echo "Flushing Django database (ALL DATA WILL BE DELETED, schema kept)..."
	$(MANAGE) flush --no-input

# DROP DATABASE at Postgres level
dropdb:
	@echo "Dropping Postgres database '$(DB_NAME)' in service $(DB_SERVICE)..."
	@echo "Ensuring database service is running..."
	$(DC) up -d $(DB_SERVICE)
	@echo "Terminating existing connections to $(DB_NAME)..."
	-$(DC) exec $(DB_SERVICE) psql -U $(DB_USER) -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$(DB_NAME)';"
	@echo "Dropping database $(DB_NAME)..."
	-$(DC) exec $(DB_SERVICE) psql -U $(DB_USER) -d postgres -c "DROP DATABASE IF EXISTS $(DB_NAME);"

# HARD RESET:
# 1) ensure db is up
# 2) drop database
# 3) recreate database
# 4) run migrations
resetdb:
	@echo "=== HARD RESET DB: $(DB_NAME) ==="
	@echo "1) Ensuring database service is running..."
	$(DC) up -d $(DB_SERVICE)
	@echo "2) Dropping existing database (if any)..."
	$(MAKE) dropdb
	@echo "3) Recreating database $(DB_NAME)..."
	$(DC) exec $(DB_SERVICE) psql -U $(DB_USER) -d postgres -c "CREATE DATABASE $(DB_NAME);"
	@echo "4) Running Django migrations..."
	$(MAKE) backend-migrate
	@echo "=== DONE: Database $(DB_NAME) reset & migrated. ==="

# --- Frontend helpers (React) ---

frontend-bash:
	@echo "Opening shell in frontend service $(FRONTEND_SERVICE)..."
	$(DC) exec $(FRONTEND_SERVICE) bash || $(DC) exec $(FRONTEND_SERVICE) sh

# Adjust 'npm' vs 'yarn' according to your container
frontend-install:
	@echo "Installing frontend dependencies..."
	$(DC) exec $(FRONTEND_SERVICE) npm install

frontend-start:
	@echo "Starting frontend dev server..."
	$(DC) exec $(FRONTEND_SERVICE) npm start

frontend-build:
	@echo "Building frontend for production..."
	$(DC) exec $(FRONTEND_SERVICE) npm run build