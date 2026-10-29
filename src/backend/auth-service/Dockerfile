FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
# pip's defaults (15 s timeout, 5 retries) are too tight for a slow, VPN or WSL network: when a package's index
# page (SQLAlchemy's is megabytes) does not arrive in time, pip reports "No matching distribution found".
RUN pip install --no-cache-dir --default-timeout=120 --retries 10 -r requirements.txt
COPY . .
EXPOSE 8000
ENV PYTHONUNBUFFERED=1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
