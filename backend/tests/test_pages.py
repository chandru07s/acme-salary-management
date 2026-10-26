from datetime import date, timedelta

import pytest

from app.config import DEFAULT_FX_TO_USD, FX_TO_USD
from app.services import equity


@pytest.fixture(autouse=True)
def restore_fx():
    yield
    FX_TO_USD.update(DEFAULT_FX_TO_USD)


class TestEquity:
    def test_ratio_is_salary_over_peer_median_within_same_title_and_country(self, db, add):
        for s in (80_000, 100_000, 120_000):
            add(country="GB", job_title="Engineer", salary=s)
        add(country="US", job_title="Engineer", salary=10)  # other country: not a peer
        rep = equity.report(db)
        by_salary = {r["salary"]: r for r in rep["items"] if r["country"] == "GB"}
        assert by_salary[80_000]["compa_ratio"] == 0.8 and by_salary[80_000]["band"] == "below"
        assert by_salary[100_000]["band"] == "within"
        assert by_salary[120_000]["compa_ratio"] == 1.2 and by_salary[120_000]["band"] == "above"
        assert by_salary[100_000]["peers"] == 3 and by_salary[100_000]["peer_median"] == 100_000

    def test_small_peer_groups_get_no_ratio(self, db, add):
        add(job_title="Lonely", salary=50_000)
        rep = equity.report(db)
        assert rep["items"] == [] and rep["summary"]["unrated"] == 1 and rep["summary"]["rated"] == 0

    def test_terminated_people_are_not_peers_or_listed(self, db, add):
        for s in (80_000, 100_000, 120_000):
            add(job_title="Engineer", salary=s)
        gone = add(job_title="Engineer", salary=1)
        gone.status = "terminated"
        db.commit()
        assert equity.report(db)["summary"]["rated"] == 3

    def test_band_filter_sorts_most_underpaid_first_and_counts_by_department(self, db, add):
        for s, dept in ((70_000, "Sales"), (80_000, "Sales"), (100_000, "Sales"), (100_000, "Sales"), (100_000, "Sales")):
            add(job_title="AE", department=dept, salary=s)
        rep = equity.report(db, band="below")
        assert [r["salary"] for r in rep["items"]] == [70_000, 80_000] and rep["total"] == 2
        assert rep["below_by_department"] == [{"department": "Sales", "count": 2}]

    def test_tenure_years(self):
        assert equity.tenure_years(date(2020, 1, 1), date(2023, 1, 1)) == 3.0

    def test_endpoint_and_employee_position(self, client, add):
        emps = [add(job_title="Engineer", salary=s) for s in (80_000, 100_000, 120_000)]
        assert client.get("/api/equity?band=below").json()["total"] == 1
        pos = client.get(f"/api/employees/{emps[0].id}/position").json()
        assert pos["compa_ratio"] == 0.8 and pos["peers"] == 3
        assert client.get("/api/employees/9999/position").status_code == 404
        assert client.get("/api/equity?band=nope").status_code == 422


class TestDashboard:
    def test_overview_shape_and_recent_activity(self, client, add):
        a = add(salary=100_000, hire_date=(date.today() - timedelta(days=30)).isoformat())
        add(hire_date="2015-01-01")
        client.patch(f"/api/employees/{a.id}", json={"salary": 110_000, "reason": "Promotion"})
        body = client.get("/api/dashboard").json()
        assert body["summary"]["headcount"] == 2 and body["hires_last_12_months"] == 1
        assert body["recent_hires"][0]["id"] == a.id
        change = body["recent_changes"][0]
        assert change["change_pct"] == 10.0 and change["reason"] == "Promotion"
        assert len(body["recent_changes"]) == 1  # the initial salary is not a "change"

    def test_empty_database(self, client):
        body = client.get("/api/dashboard").json()
        assert body["summary"]["headcount"] == 0 and body["recent_hires"] == [] and body["equity"]["below"] == 0


class TestFxSettings:
    def test_list_has_usd_first_and_marks_it_not_editable(self, client):
        rates = client.get("/api/settings/fx").json()
        assert rates[0]["currency"] == "USD" and rates[0]["editable"] is False
        assert {r["currency"] for r in rates} == set(DEFAULT_FX_TO_USD)

    def test_changing_a_rate_changes_every_usd_figure(self, client, add):
        e = add(country="GB", salary=100_000)
        assert client.get(f"/api/employees/{e.id}").json()["salary_usd"] == 127_000
        r = client.put("/api/settings/fx/GBP", json={"to_usd": 1.5})
        assert r.status_code == 200
        assert client.get(f"/api/employees/{e.id}").json()["salary_usd"] == 150_000
        assert client.get("/api/insights").json()["summary"]["total"] == 150_000
        # the SQL view the AI agent reads follows too
        from sqlalchemy import text
        assert client.app.dependency_overrides  # sanity: using the test db
        row = next(iter(client.app.dependency_overrides.values()))().execute(
            text("SELECT salary_usd FROM employee_pay")).scalar()
        assert row == 150_000

    def test_sorting_by_usd_uses_the_new_rate(self, client, add):
        add(country="GB", salary=100_000, full_name="Brit")   # 127k
        add(country="US", salary=130_000, full_name="Yank")   # 130k
        top = lambda: client.get("/api/employees?sort_by=salary_usd&order=desc").json()["items"][0]["full_name"]
        assert top() == "Yank"
        client.put("/api/settings/fx/GBP", json={"to_usd": 2.0})
        assert top() == "Brit"

    @pytest.mark.parametrize("body", [{"to_usd": 0}, {"to_usd": -1}, {"to_usd": 5000}, {}])
    def test_invalid_rates_are_rejected(self, client, body):
        assert client.put("/api/settings/fx/GBP", json=body).status_code == 422

    def test_usd_is_fixed_and_unknown_currency_is_404(self, client):
        assert client.put("/api/settings/fx/USD", json={"to_usd": 2}).status_code == 422
        assert client.put("/api/settings/fx/XXX", json={"to_usd": 2}).status_code == 404

    def test_reset_restores_defaults(self, client):
        client.put("/api/settings/fx/EUR", json={"to_usd": 9})
        rates = {r["currency"]: r["to_usd"] for r in client.post("/api/settings/fx/reset").json()}
        assert rates["EUR"] == DEFAULT_FX_TO_USD["EUR"]
