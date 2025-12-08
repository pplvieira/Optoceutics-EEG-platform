#!/bin/bash
echo "Starting Python EDF Processing Backend..."
echo

echo "Installing dependencies..."
pip install -r requirements.txt

echo
echo "Starting FastAPI server on http://localhost:8000"
echo "Press Ctrl+C to stop"
echo

python main.py