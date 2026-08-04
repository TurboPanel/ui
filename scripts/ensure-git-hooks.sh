#!/usr/bin/env sh
# Wire core.hooksPath=.githooks so pre-commit (lint/typecheck/test) actually runs.
# Safe no-op outside a git work tree or when .githooks/pre-commit is missing.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"

if [ ! -f "$ROOT/.githooks/pre-commit" ]; then
  exit 0
fi

if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

current=$(git -C "$ROOT" config --local --get core.hooksPath 2>/dev/null || true)
if [ "$current" != ".githooks" ]; then
  git -C "$ROOT" config --local core.hooksPath .githooks
  echo "ensure-git-hooks: set core.hooksPath=.githooks"
fi

chmod +x "$ROOT"/.githooks/* 2>/dev/null || true
