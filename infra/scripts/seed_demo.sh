#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../../backend"
python manage.py seed_demo_data "$@"
