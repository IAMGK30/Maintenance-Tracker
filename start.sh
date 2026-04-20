#!/bin/bash
# start.sh – Install deps and start both backend and frontend

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "⚡ TaskEscalate Setup"
echo "━━━━━━━━━━━━━━━━━━━━"

# Backend
echo ""
echo "📦 Installing backend dependencies..."
cd "$ROOT/backend"
npm install --silent

# Copy .env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created backend/.env (edit it to configure SMTP etc.)"
fi

# Frontend
echo ""
echo "📦 Installing frontend dependencies..."
cd "$ROOT/frontend"
npm install --silent

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete!"
echo ""
echo "To start the app, open two terminals:"
echo ""
echo "  Terminal 1 (Backend):"
echo "    cd backend && node server.js"
echo ""
echo "  Terminal 2 (Frontend):"
echo "    cd frontend && npm run dev"
echo ""
echo "  Then open: http://localhost:5173"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
