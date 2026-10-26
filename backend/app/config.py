"""Static configuration: supported countries, their currencies and FX rates.

FX rates are deliberately static and approximate (see docs/REQUIREMENTS.md):
they keep tests deterministic and avoid an external dependency. Replace with a
rate-sync job when real-time conversion is needed.
"""
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./salary.db")

REPORTING_CURRENCY = "USD"

# ISO-3166 alpha-2 country -> ISO-4217 currency. Currency is derived from the
# country server-side so the two can never disagree.
COUNTRY_CURRENCY: dict[str, str] = {
    "US": "USD",
    "GB": "GBP",
    "DE": "EUR",
    "IN": "INR",
    "CA": "CAD",
    "AU": "AUD",
    "SG": "SGD",
    "JP": "JPY",
}

COUNTRY_NAMES: dict[str, str] = {
    "US": "United States",
    "GB": "United Kingdom",
    "DE": "Germany",
    "IN": "India",
    "CA": "Canada",
    "AU": "Australia",
    "SG": "Singapore",
    "JP": "Japan",
}

# 1 unit of currency -> USD
FX_TO_USD: dict[str, float] = {
    "USD": 1.0,
    "GBP": 1.27,
    "EUR": 1.08,
    "INR": 0.012,
    "CAD": 0.73,
    "AUD": 0.65,
    "SGD": 0.74,
    "JPY": 0.0067,
}

# Pristine defaults; FX_TO_USD above is what the app uses and can be edited at runtime (Settings page).
DEFAULT_FX_TO_USD: dict[str, float] = dict(FX_TO_USD)

# Upper bounds (USD, exclusive) for the salary distribution histogram.
SALARY_BAND_EDGES_USD: list[int] = [30_000, 50_000, 75_000, 100_000, 150_000, 200_000]
