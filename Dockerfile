FROM docker.io/library/python:3.12-slim
WORKDIR /app
RUN useradd --uid 1000 --create-home app && mkdir /data && chown app:app /data
COPY app/ /app/
COPY entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh
ENV DATA_DIR=/data PORT=8080 PYTHONUNBUFFERED=1
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8080/api/auth/status')" || exit 1
ENTRYPOINT ["/entrypoint.sh"]
