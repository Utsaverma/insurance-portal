FROM python:3.12-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends libmagic1 curl \
    && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
# pip's defaults (15 s timeout, 5 retries) are too tight for a slow, VPN or WSL network: when a package's index
# page (SQLAlchemy's is megabytes) does not arrive in time, pip reports "No matching distribution found".
RUN pip install --no-cache-dir --default-timeout=120 --retries 10 -r requirements.txt
COPY . .
RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
