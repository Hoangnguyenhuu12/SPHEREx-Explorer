"""Start the local hybrid API with the existing astronomy archive settings."""

import argparse
import os
import sys
from pathlib import Path

import uvicorn
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    if not args.env_file.is_file():
        parser.error(f"Configuration file not found: {args.env_file}")

    load_dotenv(args.env_file, override=False)
    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_ANON_KEY"):
        parser.error("Set SUPABASE_URL and SUPABASE_ANON_KEY for the astronomy archive.")

    os.environ["DATA_MODE"] = "hybrid"
    if os.getenv("DATA_DIR"):
        os.environ["DATA_DIR"] = str(args.env_file.resolve().parent / os.environ["DATA_DIR"])
    os.chdir(ROOT)
    sys.path[:0] = [str(ROOT), str(ROOT / "members" / "dong")]
    uvicorn.run("app.main:app", host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
