# 编译阶段：Crow 和 Asio 由 CMake 自动获取。
FROM debian:bookworm-slim AS builder
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /source
COPY CMakeLists.txt ./
COPY src/ ./src/
COPY static/ ./static/
COPY data/ ./data/
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build --parallel 2

# 运行阶段：只携带程序、运行库和网站资源，不携带编译器。
FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 boringlab \
    && useradd --uid 10001 --gid boringlab --no-create-home --shell /usr/sbin/nologin boringlab
WORKDIR /app
COPY --from=builder /source/build/boring_lab ./boring_lab
COPY --from=builder /source/build/static/ ./static/
COPY --from=builder /source/build/data/ ./data/
ENV HOST=0.0.0.0 PORT=10000
USER boringlab
# EXPOSE 是说明，实际监听端口由运行时 PORT 决定。
EXPOSE 10000
CMD ["./boring_lab"]
