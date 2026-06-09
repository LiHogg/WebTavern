#!/bin/sh
set -e

cd /app/backend

echo "[render] applying migrations"
python manage.py migrate --noinput

echo "[render] collecting static files"
python manage.py collectstatic --noinput

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "[render] seeding demo data"
  python manage.py seed_demo_data || true

  echo "[render] syncing hall capacities"
  python manage.py sync_hall_capacities || true
fi

echo "[render] starting Daphne"
exec daphne -b 0.0.0.0 -p "${PORT:-8000}" config.asgi:application
