#!/bin/bash

DB_USER="omnipair_user"
DB_NAME="omnipair_indexer"

psql -U $DB_USER -d $DB_NAME -f $1
