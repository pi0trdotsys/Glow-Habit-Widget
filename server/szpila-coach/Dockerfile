FROM python:3.12-alpine
WORKDIR /app
COPY app.py .
USER 1000:1000
ENV PYTHONUNBUFFERED=1
CMD ["python", "app.py"]
