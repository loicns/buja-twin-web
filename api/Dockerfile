FROM python:3.11-slim
# Lambda Web Adapter: forwards Function URL requests to the uvicorn server below (check the latest tag)
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MODEL_DIR=/app/model OMP_NUM_THREADS=2 \
    AWS_LWA_PORT=8080 AWS_LWA_READINESS_CHECK_PATH=/health
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
COPY model/ model/
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
