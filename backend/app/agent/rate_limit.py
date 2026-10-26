import time
from collections import deque


class RateLimiter:
    """Sliding-window limiter. Protects the OpenAI key on a public deployment."""

    def __init__(self, max_calls: int, per_seconds: float, clock=time.monotonic):
        self.max_calls = max_calls
        self.per_seconds = per_seconds
        self._clock = clock
        self._calls: deque[float] = deque()

    def allow(self) -> bool:
        now = self._clock()
        while self._calls and now - self._calls[0] >= self.per_seconds:
            self._calls.popleft()
        if len(self._calls) >= self.max_calls:
            return False
        self._calls.append(now)
        return True
