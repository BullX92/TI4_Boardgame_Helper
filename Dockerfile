# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src
COPY Directory.Build.props ./
COPY Ti4Companion.ApiService/Ti4Companion.ApiService.csproj Ti4Companion.ApiService/
COPY Ti4Companion.ServiceDefaults/Ti4Companion.ServiceDefaults.csproj Ti4Companion.ServiceDefaults/
COPY Ti4Companion.Shared/Ti4Companion.Shared.csproj Ti4Companion.Shared/
COPY Ti4Companion.Web/Ti4Companion.Web.csproj Ti4Companion.Web/
RUN dotnet restore Ti4Companion.ApiService/Ti4Companion.ApiService.csproj
COPY Ti4Companion.ApiService/ Ti4Companion.ApiService/
COPY Ti4Companion.ServiceDefaults/ Ti4Companion.ServiceDefaults/
COPY Ti4Companion.Shared/ Ti4Companion.Shared/
COPY Ti4Companion.Web/ Ti4Companion.Web/
RUN dotnet publish Ti4Companion.ApiService/Ti4Companion.ApiService.csproj \
    --configuration Release --no-restore --output /out /p:UseAppHost=false
# Plain hosted static files need the actual boot-script filename (see publish.ps1).
RUN boot="$(find /out/wwwroot/_framework -maxdepth 1 -name 'blazor.webassembly*.js' -print -quit)" \
    && test -n "$boot" \
    && sed -i -E "s|_framework/blazor\\.webassembly[^\"]*\\.js|_framework/$(basename "$boot")|g" /out/wwwroot/index.html \
    && ! grep -q '#\[' /out/wwwroot/index.html

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble AS runtime
ARG VCS_REF=development
LABEL org.opencontainers.image.title="TI4 Boardgame Helper" \
    org.opencontainers.image.source="https://github.com/BullX92/TI4_Boardgame_Helper" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.revision=$VCS_REF
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    ConnectionStrings__ti4db="Data Source=/data/ti4.db" \
    ConnectionStrings__ti4masterdb="Data Source=/data/ti4master.db" \
    TI4_REVISION=$VCS_REF \
    HOME=/data
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data /app/seed \
    && chown app:app /data
COPY --from=build /out/ ./
COPY --from=build /src/Ti4Companion.ApiService/ti4master.db /app/seed/ti4master.db
COPY LICENSE THIRD-PARTY-NOTICES.md ./
COPY --chmod=755 deploy/docker-entrypoint.sh /usr/local/bin/ti4-entrypoint
# Enforce executable mode even on builders that do not retain COPY --chmod metadata.
RUN chmod 0755 /usr/local/bin/ti4-entrypoint
USER $APP_UID
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["/usr/local/bin/ti4-entrypoint"]
