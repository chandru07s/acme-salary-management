# --- build the React UI ---
FROM node:22-slim AS ui
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- API + static UI in one service ---
FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY --from=ui /app/frontend/dist frontend/dist

WORKDIR /app/backend
ENV AUTO_SEED=1 SEED_COUNT=10000 DATABASE_URL=sqlite:///./salary.db
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
