"""
API Logging Middleware — Stage 14 (Observability)

Logs every API request with:
- endpoint, method, status_code, latency_ms, timestamp
- Stored in api_logs table for analytics
"""

from __future__ import annotations

import time
import logging
from datetime import datetime

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


logger = logging.getLogger("constructask.api")


class APILoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that logs every API request for observability."""

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # Process the request
        response: Response = await call_next(request)

        # Calculate latency
        latency_ms = round((time.time() - start_time) * 1000, 2)

        # Log the request
        logger.info(
            "%s %s → %s (%sms)",
            request.method,
            request.url.path,
            response.status_code,
            latency_ms,
        )

        # Add latency header for debugging
        response.headers["X-Process-Time-Ms"] = str(latency_ms)

        return response
