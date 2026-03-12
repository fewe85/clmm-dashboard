#!/bin/bash
cd ~/claude-workspace/clmm-dashboard
npm run dev &
sleep 3
xdg-open http://localhost:5173/clmm-dashboard/
