FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends blender python3 python3-numpy python3-venv git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/indexer && /opt/indexer/bin/pip install --no-cache-dir graphifyy==0.9.63
RUN useradd --create-home --uid 10001 lesson
WORKDIR /app
COPY scene-schema.json validation.py compile_scene.py server.py ./
COPY index_repository.py repository_jobs.py ./
USER lesson
ENV PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["/opt/indexer/bin/python", "server.py"]
