FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home student && mkdir /app/data && chown student:student /app/data
COPY server.py .
COPY public ./public
USER student
ENV HOST=0.0.0.0 PORT=8000 PYTHONDONTWRITEBYTECODE=1
EXPOSE 8000
VOLUME ["/app/data"]
CMD ["python", "server.py"]
