"""Import an existing sky archive SQL file using PostgreSQL settings from .env."""

import argparse
import os
from pathlib import Path
import subprocess

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
CONNECTION_KEYS = (
    "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE", "PGSSLROOTCERT",
)


def connection_settings(env_file):
    values = dotenv_values(env_file, interpolate=False)
    env = os.environ.copy()
    env.setdefault("PGSSLMODE", "require")
    env.setdefault("PGCONNECT_TIMEOUT", "10")
    for key in CONNECTION_KEYS:
        if values.get(key) is not None:
            env[key] = values[key]
    missing = [key for key in ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER") if not env.get(key)]
    if missing:
        raise ValueError(f"Set {', '.join(missing)} in {env_file} or in the environment.")
    return env, values.get("PSQL_PATH") or env.get("PSQL_PATH") or "psql"


def run_psql(env, executable, arguments):
    subprocess.run([executable, "-X", "-v", "ON_ERROR_STOP=1", *arguments], env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--psql", help="Path to the psql executable")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--check", action="store_true", help="Check the connection without importing")
    action.add_argument("--file", type=Path, help="SQL file to import (default: data/sky-archive.sql)")
    args = parser.parse_args()
    sql = args.file or ROOT / "data" / "sky-archive.sql"
    if not args.check and not sql.is_file():
        parser.error(f"SQL file not found: {sql}")
    try:
        env, executable = connection_settings(args.env_file)
        arguments = (
            ["-c", "SELECT current_database() AS database, current_user AS db_user;"]
            if args.check else ["-f", str(sql)]
        )
        run_psql(env, args.psql or executable, arguments)
    except ValueError as error:
        parser.error(str(error))
    except FileNotFoundError:
        parser.error("psql was not found. Set PSQL_PATH in .env or pass --psql.")
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode) from None


if __name__ == "__main__":
    main()
