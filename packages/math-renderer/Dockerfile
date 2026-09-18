FROM debian:bookworm-slim
# manim needs cairo/pango for shapes and text, ffmpeg to encode, and a LaTeX
# subset for MathTex. texlive-latex-extra carries the maths packages manim's
# template loads; the full distribution is several GB and is not needed.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-numpy ffmpeg \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
      texlive-latex-base texlive-latex-extra texlive-fonts-recommended \
      texlive-science dvisvgm ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --break-system-packages manim==0.18.1
RUN useradd --create-home --uid 10001 math
WORKDIR /app
COPY math-schema.json validation.py compile_math.py server.py ./
USER math
ENV PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python3", "server.py"]
