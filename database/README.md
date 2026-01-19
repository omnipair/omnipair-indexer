# Omnipair Database

Please use `omnipair_user` as user name and `omnipair_indexer` as db name for your local db.
You'll need a `.env` file please create it in `database` root folder.

In `./scripts` you have two scripts.

One that reconstruct the public db, from `PUBLIC_DB_URL` variable in `.env` file.
So to execute it: `./scripts/reconstruct_public_db.sh` (you need to execute it from `database` root folder to have the `.env` file applied)

An other one that can apply migrations to your local db.
All the migrations files are in the `./migrations` folder.
So to execute it: `./scripts/apply_migrations.sh migrations/your_migration.sql`
