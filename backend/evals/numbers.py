"""Find the numbers an answer mentions, so a reply like "about $94k" can be compared with the true 94,000."""
import re

_NUMBER = re.compile(
    r"(?<![\w.])(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|k|m|bn|b)?\b",
    re.IGNORECASE,
)
_SCALE = {"k": 1e3, "thousand": 1e3, "m": 1e6, "million": 1e6, "b": 1e9, "bn": 1e9, "billion": 1e9}


def extract_numbers(text: str) -> list[float]:
    """'$94k', '94,000', '1.2M' and '2 million' all become plain floats."""
    found = []
    for raw, suffix in _NUMBER.findall(text):
        try:
            value = float(raw.replace(",", ""))
        except ValueError:
            continue
        found.append(value * _SCALE.get(suffix.lower(), 1.0))
    return found


def contains_number(text: str, expected: float, rel_tol: float = 0.01) -> bool:
    """True if the text mentions `expected` to within rel_tol (1% by default, to allow '$94k' for 94,120)."""
    tolerance = max(abs(expected) * rel_tol, 0.5)
    return any(abs(n - expected) <= tolerance for n in extract_numbers(text))
