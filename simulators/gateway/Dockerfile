FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir paho-mqtt websockets

COPY *.py .

CMD ["python", "-u", "simulate_gateway.py"]
