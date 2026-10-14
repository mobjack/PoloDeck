FROM python:3.12-slim-bookworm

ARG PLATFORMIO_VERSION=6.2.0

RUN python -m pip install --no-cache-dir "platformio==${PLATFORMIO_VERSION}"

ENV PLATFORMIO_CORE_DIR=/platformio
ENV PLATFORMIO_DISABLE_UPGRADE_CHECK=true

WORKDIR /workspace

ENTRYPOINT ["pio"]
CMD ["run"]
