"""HTTP observability primitives for API request tracing and diagnostics."""

from __future__ import annotations

import logging
import math
import re
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Awaitable, Callable

from fastapi import Request, Response

from text.api.models import HttpRequestEvent, ObservabilitySnapshot, RouteObservabilityStats

logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


@dataclass(slots=True)
class _RouteAggregate:
    method: str
    route: str
    count: int = 0
    error_count: int = 0
    total_ms: float = 0.0
    max_ms: float = 0.0
    last_status_code: int | None = None
    recent_durations: deque[float] = field(default_factory=lambda: deque(maxlen=512))

    def add(self, *, duration_ms: float, status_code: int) -> None:
        self.count += 1
        self.total_ms += duration_ms
        if duration_ms > self.max_ms:
            self.max_ms = duration_ms
        self.recent_durations.append(duration_ms)
        self.last_status_code = status_code
        if status_code >= 400:
            self.error_count += 1

    def snapshot(self) -> RouteObservabilityStats:
        avg = self.total_ms / self.count if self.count else 0.0
        p95 = _p95(self.recent_durations)
        return RouteObservabilityStats(
            method=self.method,
            route=self.route,
            count=self.count,
            error_count=self.error_count,
            avg_ms=round(avg, 3),
            max_ms=round(self.max_ms, 3),
            p95_ms=round(p95, 3) if p95 is not None else None,
            last_status_code=self.last_status_code,
        )


@dataclass(slots=True)
class _RequestEvent:
    timestamp: float
    request_id: str
    method: str
    path: str
    route: str
    status_code: int
    duration_ms: float
    client_ip: str | None

    def snapshot(self) -> HttpRequestEvent:
        return HttpRequestEvent(
            timestamp=self.timestamp,
            request_id=self.request_id,
            method=self.method,
            path=self.path,
            route=self.route,
            status_code=self.status_code,
            duration_ms=round(self.duration_ms, 3),
            client_ip=self.client_ip,
        )


class ObservabilityRegistry:
    """In-memory request metrics and recent event buffers."""

    def __init__(
        self,
        *,
        enabled: bool,
        slow_request_ms: float,
        event_limit: int,
    ) -> None:
        self.enabled = enabled
        self.slow_request_ms = max(0.0, slow_request_ms)
        self._started_at = time.time()
        self._lock = Lock()

        self._in_flight = 0
        self._total_requests = 0
        self._success_requests = 0
        self._client_error_requests = 0
        self._server_error_requests = 0
        self._slow_requests = 0

        self._routes: dict[tuple[str, str], _RouteAggregate] = {}
        limit = max(10, event_limit)
        self._recent_requests: deque[_RequestEvent] = deque(maxlen=limit)
        self._recent_errors: deque[_RequestEvent] = deque(maxlen=limit)
        self._recent_slow: deque[_RequestEvent] = deque(maxlen=limit)

    def begin_request(self) -> None:
        if not self.enabled:
            return
        with self._lock:
            self._in_flight += 1

    def finish_request(
        self,
        *,
        request_id: str,
        method: str,
        path: str,
        route: str,
        status_code: int,
        duration_ms: float,
        client_ip: str | None,
    ) -> bool:
        """Record a finished request and return whether it is considered slow."""
        if not self.enabled:
            return False

        event = _RequestEvent(
            timestamp=time.time(),
            request_id=request_id,
            method=method,
            path=path,
            route=route,
            status_code=status_code,
            duration_ms=duration_ms,
            client_ip=client_ip,
        )

        with self._lock:
            self._in_flight = max(0, self._in_flight - 1)
            self._total_requests += 1
            if status_code >= 500:
                self._server_error_requests += 1
            elif status_code >= 400:
                self._client_error_requests += 1
            else:
                self._success_requests += 1

            if duration_ms >= self.slow_request_ms:
                self._slow_requests += 1
                self._recent_slow.append(event)

            if status_code >= 400:
                self._recent_errors.append(event)

            self._recent_requests.append(event)

            key = (method, route)
            aggregate = self._routes.get(key)
            if aggregate is None:
                aggregate = _RouteAggregate(method=method, route=route)
                self._routes[key] = aggregate
            aggregate.add(duration_ms=duration_ms, status_code=status_code)

        return duration_ms >= self.slow_request_ms

    def snapshot(self, *, top_routes: int = 20, recent: int = 50) -> ObservabilitySnapshot:
        if not self.enabled:
            return ObservabilitySnapshot(
                enabled=False,
                uptime_s=round(max(0.0, time.time() - self._started_at), 3),
                in_flight=0,
                total_requests=0,
                success_requests=0,
                client_error_requests=0,
                server_error_requests=0,
                slow_requests=0,
                slow_request_threshold_ms=self.slow_request_ms,
                routes=[],
                recent_requests=[],
                recent_errors=[],
                recent_slow_requests=[],
            )

        with self._lock:
            route_stats = [item.snapshot() for item in self._routes.values()]
            route_stats.sort(key=lambda item: item.count, reverse=True)

            recent_requests = [item.snapshot() for item in list(self._recent_requests)[-recent:]][::-1]
            recent_errors = [item.snapshot() for item in list(self._recent_errors)[-recent:]][::-1]
            recent_slow = [item.snapshot() for item in list(self._recent_slow)[-recent:]][::-1]

            return ObservabilitySnapshot(
                enabled=True,
                uptime_s=round(max(0.0, time.time() - self._started_at), 3),
                in_flight=self._in_flight,
                total_requests=self._total_requests,
                success_requests=self._success_requests,
                client_error_requests=self._client_error_requests,
                server_error_requests=self._server_error_requests,
                slow_requests=self._slow_requests,
                slow_request_threshold_ms=self.slow_request_ms,
                routes=route_stats[:top_routes],
                recent_requests=recent_requests,
                recent_errors=recent_errors,
                recent_slow_requests=recent_slow,
            )


def resolve_request_id(raw: str | None) -> str:
    if raw is None:
        return uuid.uuid4().hex
    candidate = raw.strip()
    if _REQUEST_ID_RE.fullmatch(candidate):
        return candidate
    return uuid.uuid4().hex


async def http_observability_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    registry = getattr(request.app.state, "observability", None)
    if not isinstance(registry, ObservabilityRegistry):
        return await call_next(request)

    request_id = resolve_request_id(request.headers.get(REQUEST_ID_HEADER))
    request.state.request_id = request_id
    if not registry.enabled:
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response

    method = request.method
    path = request.url.path
    client_ip = request.client.host if request.client else None
    started = time.perf_counter()

    registry.begin_request()

    response: Response | None = None
    status_code = 500
    route = path

    try:
        response = await call_next(request)
        status_code = response.status_code
        route_obj = request.scope.get("route")
        route = getattr(route_obj, "path", path)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
    except Exception:
        route_obj = request.scope.get("route")
        route = getattr(route_obj, "path", path)
        logger.exception(
            "Unhandled API exception method=%s path=%s route=%s request_id=%s",
            method,
            path,
            route,
            request_id,
        )
        raise
    finally:
        duration_ms = (time.perf_counter() - started) * 1000.0
        is_slow = registry.finish_request(
            request_id=request_id,
            method=method,
            path=path,
            route=route,
            status_code=status_code,
            duration_ms=duration_ms,
            client_ip=client_ip,
        )

        level = logging.INFO
        if status_code >= 500:
            level = logging.ERROR
        elif status_code >= 400:
            level = logging.WARNING

        logger.log(
            level,
            "HTTP %s %s -> %s in %.1fms route=%s request_id=%s client=%s",
            method,
            path,
            status_code,
            duration_ms,
            route,
            request_id,
            client_ip or "-",
        )

        if is_slow:
            logger.warning(
                "Slow request: %s %s took %.1fms (> %.1fms) request_id=%s",
                method,
                path,
                duration_ms,
                registry.slow_request_ms,
                request_id,
            )


def _p95(values: deque[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(len(ordered) * 0.95))
    return ordered[rank - 1]
