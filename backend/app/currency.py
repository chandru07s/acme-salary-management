"""Pure currency helpers (no I/O)."""
from app.config import COUNTRY_CURRENCY, FX_TO_USD


class UnsupportedCurrencyError(ValueError):
    pass


class UnsupportedCountryError(ValueError):
    pass


def currency_for_country(country: str) -> str:
    try:
        return COUNTRY_CURRENCY[country]
    except KeyError:
        raise UnsupportedCountryError(f"Unsupported country: {country!r}") from None


def to_usd(amount: float | int, currency: str) -> float:
    try:
        rate = FX_TO_USD[currency]
    except KeyError:
        raise UnsupportedCurrencyError(f"Unsupported currency: {currency!r}") from None
    return round(amount * rate, 2)
