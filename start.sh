#!/bin/bash

# Kill all OpenClaw processes
echo "Killing all OpenClaw processes..."
pkill -9 -f openclaw 2>/dev/null
pkill -9 -f 'node.*gateway' 2>/dev/null
pkill -9 -f 'node.*run' 2>/dev/null

# Wait and ensure processes are killed
echo "Waiting for processes to terminate..."
sleep 2

# Double-check and force kill any remaining
remaining=$(ps aux | grep -E 'openclaw|node.*18789' | grep -v grep | wc -l)
if [ "$remaining" -gt 0 ]; then
    echo "Found $remaining remaining processes, force killing..."
    ps aux | grep -E 'openclaw|node.*18789' | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null
    sleep 1
fi

# Verify all processes are dead
final_check=$(ps aux | grep -E 'openclaw|node.*18789' | grep -v grep | wc -l)
if [ "$final_check" -gt 0 ]; then
    echo "ERROR: Could not kill all OpenClaw processes"
    ps aux | grep -E 'openclaw|node.*18789' | grep -v grep
    exit 1
fi

echo "All OpenClaw processes terminated successfully"

# Start gateway
echo "Starting OpenClaw gateway..."
OPENCLAW_HOME=/tmp/openclaw-sandbox ./openclaw.sh gateway --allow-unconfigured