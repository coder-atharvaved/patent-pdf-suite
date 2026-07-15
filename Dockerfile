# Build the React application first, then serve it with the Flask API.
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js PatentPDFSuiteV2.jsx ./
COPY src ./src
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5000
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY pdf_server.py ./
COPY --from=frontend-build /app/dist ./dist
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "120", "pdf_server:app"]
