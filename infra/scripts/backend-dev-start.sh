#!/bin/sh
set -e

cd /app/backend
mkdir -p /app/backend/static

echo "[backend] generating migrations if needed"
python manage.py makemigrations --noinput

echo "[backend] applying migrations"
python manage.py migrate --noinput

echo "[backend] seeding demo data"
python manage.py seed_demo_data

echo "[backend] syncing hall capacities"
python manage.py sync_hall_capacities

echo "[backend] starting django"
python manage.py runserver 0.0.0.0:8000
