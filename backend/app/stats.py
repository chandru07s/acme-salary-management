"""Pure statistics helpers (no I/O) used by the insights service."""
from statistics import median as _median


def summarize(values: list[float]) -> dict:
    """Headcount, total, min, avg, median, max for a list of salaries."""
    if not values:
        return {"headcount": 0, "total": 0.0, "min": 0.0, "avg": 0.0, "median": 0.0, "max": 0.0}
    total = sum(values)
    return {
        "headcount": len(values),
        "total": round(total, 2),
        "min": round(min(values), 2),
        "avg": round(total / len(values), 2),
        "median": round(_median(values), 2),
        "max": round(max(values), 2),
    }


def distribution(values: list[float], edges: list[int]) -> list[dict]:
    """Histogram with half-open bands [lo, hi). The last band is open-ended."""
    bounds = [0, *edges]
    counts = [0] * len(bounds)
    for v in values:
        idx = 0
        for i, lo in enumerate(bounds):
            if v >= lo:
                idx = i
        counts[idx] += 1

    bands = []
    for i, lo in enumerate(bounds):
        hi = bounds[i + 1] if i + 1 < len(bounds) else None
        bands.append({"min": lo, "max": hi, "label": _label(lo, hi), "count": counts[i]})
    return bands


def _label(lo: int, hi: int | None) -> str:
    def k(n: int) -> str:
        return f"{n // 1000}k"

    if hi is None:
        return f"{k(lo)}+"
    if lo == 0:
        return f"< {k(hi)}"
    return f"{k(lo)} – {k(hi)}"
