FROM public.ecr.aws/lambda/python:3.12
RUN dnf install -y mesa-libGL && dnf clean all
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu torch torchvision ultralytics
COPY handler.py ${LAMBDA_TASK_ROOT}/
CMD ["handler.handler"]
