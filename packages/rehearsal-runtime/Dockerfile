# Rehearsal controller (server.py): brokers Modal sandboxes and model calls for the control plane's RepositoryRehearsals objects.
# No sandbox runs here; this image only needs Python and the three pinned packages.
FROM python:3.13-slim
RUN useradd --create-home --uid 10001 rehearsal
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
COPY providers/ ./providers/
COPY schemas/ ./schemas/
RUN rm -f test_*.py
USER rehearsal
ENV PYTHONUNBUFFERED=1 PYTHONWARNINGS=ignore REHEARSAL_HOST=0.0.0.0 REHEARSAL_PORT=8891
EXPOSE 8891
CMD ["python", "server.py"]
