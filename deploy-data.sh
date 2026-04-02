#!/bin/bash
# Lightweight data-only deploy to gh-pages (no full rebuild)
set -e

cd /home/flex/claude-workspace/clmm-dashboard

DIST_API="dist/api/bot-state"
BOT_DIR="/home/flex/claude-workspace/thala-bot"

# Copy fresh bot state files
cp -f "$BOT_DIR/apt-usdc/state.json"                    "$DIST_API/thala.json"
cp -f "$BOT_DIR/apt-usdc/logs/rebalance-metrics.jsonl"   "$DIST_API/rebalance-metrics.jsonl"
cp -f "$BOT_DIR/elon-usdc/state.json"                    "$DIST_API/elon.json"
cp -f "$BOT_DIR/elon-usdc/logs/rebalance-metrics.jsonl"  "$DIST_API/elon-rebalance-metrics.jsonl"

# Push to gh-pages
npx gh-pages -d dist --no-history 2>/dev/null
