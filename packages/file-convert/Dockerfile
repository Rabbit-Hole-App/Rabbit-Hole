# rabbit-hole-convert-dev: the DEVELOPMENT file conversion service (docs/features/canvas-file-converter.md).
# Built from the context packages/file-convert/context.sh makes (`git archive HEAD` of this
# directory only), so the image is exactly a commit. Pattern of the motion renderer
# (packages/learn-render/motion/service): non-root service user, bearer token, a sandboxed child
# with no network under cgroup limits, a hard timeout and output caps.
#
# Pins: the Debian trixie base by digest; Debian packages from snapshot.debian.org at one
# timestamp AND by exact version; FFmpeg from its signed release tarball by sha256 (an LGPL build
# with only the components the audio converter needs); occt-import-js from the npm registry by
# its sha512 integrity.
ARG BASE=node:24.19.0-trixie-slim@sha256:ab3eebe934147fee049b5eb83c570f68c849a13c930bdfa482de99fcdfa3b3de
ARG SNAPSHOT=20261016T000000Z

FROM ${BASE} AS ffmpeg
ARG SNAPSHOT
RUN printf 'Types: deb\nURIs: http://snapshot.debian.org/archive/debian/%s\nSuites: trixie trixie-updates\nComponents: main\nSigned-By: /usr/share/keyrings/debian-archive-keyring.gpg\n\nTypes: deb\nURIs: http://snapshot.debian.org/archive/debian-security/%s\nSuites: trixie-security\nComponents: main\nSigned-By: /usr/share/keyrings/debian-archive-keyring.gpg\n' "$SNAPSHOT" "$SNAPSHOT" > /etc/apt/sources.list.d/debian.sources \
 && apt-get -o Acquire::Check-Valid-Until=false -o Acquire::Retries=5 update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils build-essential nasm pkg-config \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
# FFmpeg 8.1.3, release tarball signed by the FFmpeg release key FCF986EA15E6E293A5644F10B4322F04D67658D8
# (signature checked when this pin was set; the sha256 below is that verified file).
RUN curl -fsSL -o ffmpeg.tar.xz https://ffmpeg.org/releases/ffmpeg-8.1.3.tar.xz \
 && echo "7138d28c96d9d3e3af4ee3d8cad72741f8ffb40da90c1112235dea3ecd3178a3  ffmpeg.tar.xz" | sha256sum -c - \
 && tar xJf ffmpeg.tar.xz
# LGPL v2.1+: no --enable-gpl, --enable-nonfree or --enable-version3, no external libraries
# (--disable-autodetect), no network protocols. Only what audio-playback reads and writes:
# common audio demuxers/decoders, the native AAC (and Opus) encoders, the MP4/Ogg/WebM muxers.
RUN cd ffmpeg-8.1.3 && ./configure --prefix=/opt/ffmpeg \
      --disable-autodetect --disable-everything --disable-network --disable-doc --disable-debug --disable-ffplay \
      --enable-ffmpeg --enable-ffprobe --enable-static --disable-shared \
      --enable-protocol=file,pipe \
      --enable-demuxer=mp3,wav,w64,ogg,mov,flac,aac,matroska,aiff \
      --enable-decoder='mp3*,pcm_*,adpcm_ima_wav,adpcm_ms,vorbis,opus,flac,aac,aac_fixed,alac' \
      --enable-parser=mpegaudio,aac,flac,vorbis,opus \
      --enable-encoder=aac,opus \
      --enable-muxer=mp4,ipod,ogg,webm,null \
      --enable-bsf=aac_adtstoasc \
      --enable-filter=aresample,aformat,anull,atrim \
 && make -j"$(nproc)" && make install \
 && cp COPYING.LGPLv2.1 LICENSE.md /opt/ffmpeg/

FROM ${BASE}
ARG SNAPSHOT
ARG CONVERT_BUILD=unknown
# LibreOffice (no GUI) for Writer and Impress, poppler-utils for PDF pages/text, metric-
# compatible fonts (Liberation for Arial/Times/Courier, Carlito for Calibri, Caladea for
# Cambria), iproute2/sudo/procps for the sandbox. Exact versions from the snapshot.
RUN printf 'Types: deb\nURIs: http://snapshot.debian.org/archive/debian/%s\nSuites: trixie trixie-updates\nComponents: main\nSigned-By: /usr/share/keyrings/debian-archive-keyring.gpg\n\nTypes: deb\nURIs: http://snapshot.debian.org/archive/debian-security/%s\nSuites: trixie-security\nComponents: main\nSigned-By: /usr/share/keyrings/debian-archive-keyring.gpg\n' "$SNAPSHOT" "$SNAPSHOT" > /etc/apt/sources.list.d/debian.sources \
 && apt-get -o Acquire::Check-Valid-Until=false -o Acquire::Retries=5 update \
 && apt-get install -y --no-install-recommends \
      libreoffice-core-nogui=4:25.2.3-2+deb13u8 libreoffice-writer-nogui=4:25.2.3-2+deb13u8 libreoffice-impress-nogui=4:25.2.3-2+deb13u8 \
      poppler-utils=25.03.0-5+deb13u4 \
      fonts-liberation=1:2.1.5-3 fonts-crosextra-carlito=20230309-2 fonts-crosextra-caladea=20200211-2 fonts-dejavu-core=2.37-8 \
      ca-certificates curl iproute2 sudo procps \
 && rm -rf /var/lib/apt/lists/* && fc-cache -f
COPY --from=ffmpeg /opt/ffmpeg /opt/ffmpeg
# occt-import-js 0.0.23 (OpenCascade 7.6.1 as WebAssembly, LGPL-2.1): the npm tarball by integrity.
RUN mkdir -p /app/vendor && cd /app/vendor \
 && curl -fsSL -o occt.tgz https://registry.npmjs.org/occt-import-js/-/occt-import-js-0.0.23.tgz \
 && echo "4457d84176055f90b5981d40cb09b44a17142b35ceaff5734e797384148324e47a60200fb751d80b37975a0d6fc308e7fdc531c2a44d861b5fd5d95ec2865809  occt.tgz" | sha512sum -c - \
 && mkdir occt-import-js && tar xzf occt.tgz -C occt-import-js --strip-components=1 package/package.json package/LICENSE.md package/dist \
 && rm occt.tgz && apt-get purge -y curl >/dev/null 2>&1 || true
# Service user convert-svc; one conversion user per slot (convert-run0..3). All share the primary
# group convert and have no supplementary groups (Fly starts the service with its primary gid
# only). The convert group owns the job directories (2770, setgid) and job inputs (0640).
RUN groupadd -g 10020 convert \
 && useradd -u 10021 -g convert -M -d /var/convert -s /usr/sbin/nologin convert-svc \
 && for i in 0 1 2 3; do useradd -u $((10030 + i)) -g convert -M -d /nonexistent -s /usr/sbin/nologin convert-run$i; done
ADD src.tar /src/
RUN cp -r /src/packages/file-convert/. /app/ && rm -rf /src /app/Dockerfile /app/fly.dev.toml /app/context.sh \
 && chown -R root:root /app && chmod -R a+rX,go-w /app \
 && install -m 0755 -o root -g root /app/sandbox/convert-sandbox /usr/local/sbin/convert-sandbox \
 && install -d -m 0755 /usr/local/lib/convert \
 && install -m 0755 -o root -g root /app/sandbox/sandbox-init /usr/local/lib/convert/sandbox-init \
 && install -m 0440 -o root -g root /app/sandbox/sudoers /etc/sudoers.d/convert \
 && visudo -cf /etc/sudoers.d/convert \
 && install -d -m 0750 -o convert-svc -g convert /var/convert \
 && install -d -m 2770 -o convert-svc -g convert /var/convert/jobs \
 && command -v unshare setpriv prlimit timeout ip sudo soffice pdftoppm pdftotext pdfinfo \
 && CONVERT_BUILD=$CONVERT_BUILD node /app/build-info.mjs && chmod 0644 /app/build-info.json
ENV NODE_ENV=production CONVERT_SANDBOX=linux PORT=8080 CONVERT_BUILD=$CONVERT_BUILD PATH=/opt/ffmpeg/bin:$PATH
WORKDIR /app
USER convert-svc
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
