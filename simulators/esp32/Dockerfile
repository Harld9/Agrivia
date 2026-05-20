FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir paho-mqtt

COPY simulate_esp32.py .

CMD ["python", "-u", "simulate_esp32.py"]
