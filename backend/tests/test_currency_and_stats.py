import pytest

from app.currency import (
    UnsupportedCountryError,
    UnsupportedCurrencyError,
    currency_for_country,
    to_usd,
)
from app.stats import distribution, summarize


class TestCurrency:
    def test_country_maps_to_currency(self):
        assert currency_for_country("IN") == "INR"
        assert currency_for_country("DE") == "EUR"

    def test_unknown_country_rejected(self):
        with pytest.raises(UnsupportedCountryError):
            currency_for_country("ZZ")

    def test_usd_is_identity(self):
        assert to_usd(100_000, "USD") == 100_000

    def test_converts_using_static_rate(self):
        assert to_usd(100_000, "GBP") == 127_000
        assert to_usd(1_000_000, "INR") == 12_000

    def test_unknown_currency_rejected(self):
        with pytest.raises(UnsupportedCurrencyError):
            to_usd(1, "XXX")


class TestSummarize:
    def test_empty_list_is_all_zero(self):
        assert summarize([])["headcount"] == 0
        assert summarize([])["median"] == 0.0

    def test_odd_count_median_is_middle_value(self):
        assert summarize([10, 50, 30])["median"] == 30

    def test_even_count_median_averages_middle_two(self):
        assert summarize([10, 20, 30, 100])["median"] == 25

    def test_basic_aggregates(self):
        s = summarize([10, 20, 30, 40])
        assert (s["headcount"], s["total"], s["min"], s["avg"], s["max"]) == (4, 100, 10, 25, 40)

    def test_median_resists_outliers_unlike_average(self):
        s = summarize([50, 50, 50, 1_000_000])
        assert s["median"] == 50
        assert s["avg"] > 250_000


class TestDistribution:
    EDGES = [50_000, 100_000]

    def test_bands_are_half_open_lower_inclusive(self):
        bands = distribution([49_999, 50_000, 99_999, 100_000], self.EDGES)
        assert [b["count"] for b in bands] == [1, 2, 1]

    def test_labels(self):
        bands = distribution([], self.EDGES)
        assert [b["label"] for b in bands] == ["< 50k", "50k – 100k", "100k+"]

    def test_counts_sum_to_input_size(self):
        values = [1, 60_000, 70_000, 500_000, 99_000]
        assert sum(b["count"] for b in distribution(values, self.EDGES)) == len(values)
