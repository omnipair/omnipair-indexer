#!/bin/bash

DB_USER="omnipair_user"
DB_NAME="omnipair_indexer"

# Check if .env file exists and load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
else
  echo "Error: file .env doesn't exist"
  exit 1
fi

# Export public schema from public DB
echo "Exporting database..."
pg_dump --schema=public "$PUBLIC_DB_URL" >dump.sql

# Check if database exists and drop/recreate if it does
if psql -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
  echo "Database $DB_NAME exists. Dropping..."
  if ! dropdb -U $DB_USER $DB_NAME; then
    echo "Error: Failed to drop database $DB_NAME"
    rm dump.sql
    exit 1
  fi
  echo "Creating database $DB_NAME..."
  if ! createdb -U $DB_USER $DB_NAME; then
    echo "Error: Failed to create database $DB_NAME"
    rm dump.sql
    exit 1
  fi
else
  echo "Creating database $DB_NAME..."
  if ! createdb -U $DB_USER $DB_NAME; then
    echo "Error: Failed to create database $DB_NAME"
    rm dump.sql
    exit 1
  fi
fi

# Apply the dump to the new database
psql -U $DB_USER -d $DB_NAME -f dump.sql

# Remove the dump file
rm dump.sql
