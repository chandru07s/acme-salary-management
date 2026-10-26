from tests.conftest import make_payload


def _post(client, **overrides):
    return client.post("/api/employees", json=make_payload(**overrides))


class TestCreateEmployee:
    def test_creates_and_returns_usd_value(self, client):
        r = _post(client, country="GB", salary=100_000)
        assert r.status_code == 201
        body = r.json()
        assert body["currency"] == "GBP"
        assert body["salary_usd"] == 127_000

    def test_duplicate_email_is_409(self, client):
        _post(client)
        assert _post(client).status_code == 409

    def test_email_is_normalised(self, client):
        assert _post(client, email="  MixedCase@Acme.com ").json()["email"] == "mixedcase@acme.com"

    def test_invalid_payloads_are_422(self, client):
        assert _post(client, salary=0).status_code == 422
        assert _post(client, salary=-5).status_code == 422
        assert _post(client, country="ZZ").status_code == 422
        assert _post(client, email="not-an-email").status_code == 422
        assert _post(client, full_name="   ").status_code == 422
        assert _post(client, hire_date="2999-01-01").status_code == 422


class TestReadUpdateDelete:
    def test_get_missing_is_404(self, client):
        assert client.get("/api/employees/12345").status_code == 404

    def test_patch_salary_records_history(self, client):
        emp_id = _post(client, salary=100_000).json()["id"]
        r = client.patch(f"/api/employees/{emp_id}", json={"salary": 120_000, "reason": "Promotion"})
        assert r.status_code == 200 and r.json()["salary"] == 120_000

        history = client.get(f"/api/employees/{emp_id}/history").json()
        assert [h["new_salary"] for h in history] == [120_000, 100_000]
        assert history[0]["reason"] == "Promotion"

    def test_patch_rejects_bad_salary(self, client):
        emp_id = _post(client).json()["id"]
        assert client.patch(f"/api/employees/{emp_id}", json={"salary": -1}).status_code == 422

    def test_delete_is_soft(self, client):
        emp_id = _post(client).json()["id"]
        assert client.delete(f"/api/employees/{emp_id}").status_code == 204
        assert client.get(f"/api/employees/{emp_id}").json()["status"] == "terminated"

    def test_delete_missing_is_404(self, client):
        assert client.delete("/api/employees/777").status_code == 404


class TestListing:
    def test_pagination_envelope(self, client):
        for i in range(5):
            _post(client, email=f"p{i}@acme.com")
        body = client.get("/api/employees", params={"page": 2, "page_size": 2}).json()
        assert (body["total"], body["page"], body["page_size"], len(body["items"])) == (5, 2, 2, 2)

    def test_filters_and_search(self, client):
        _post(client, email="a@acme.com", full_name="Zed Zebra", country="JP")
        _post(client, email="b@acme.com", full_name="Amy Ant", country="US")
        assert client.get("/api/employees", params={"country": "JP"}).json()["total"] == 1
        assert client.get("/api/employees", params={"q": "ant"}).json()["items"][0]["full_name"] == "Amy Ant"

    def test_invalid_sort_field_is_422(self, client):
        assert client.get("/api/employees", params={"sort_by": "password"}).status_code == 422

    def test_page_size_over_limit_is_422(self, client):
        assert client.get("/api/employees", params={"page_size": 5000}).status_code == 422


class TestExport:
    def test_csv_respects_filters(self, client):
        _post(client, email="a@acme.com", country="JP", salary=6_000_000)
        _post(client, email="b@acme.com", country="US")
        r = client.get("/api/employees/export.csv", params={"country": "JP"})
        lines = r.text.strip().splitlines()
        assert r.headers["content-type"].startswith("text/csv")
        assert lines[0].startswith("id,full_name,email")
        assert len(lines) == 2 and "a@acme.com" in lines[1]


class TestMetaAndInsights:
    def test_meta_lists_supported_countries_with_currency(self, client):
        codes = {c["code"]: c["currency"] for c in client.get("/api/meta").json()["countries"]}
        assert codes["IN"] == "INR" and codes["DE"] == "EUR"

    def test_insights_endpoint_shape(self, client):
        _post(client, email="a@acme.com", country="US", salary=100_000)
        _post(client, email="b@acme.com", country="US", salary=200_000)
        data = client.get("/api/insights").json()
        assert data["summary"]["headcount"] == 2
        assert data["summary"]["median"] == 150_000
        assert {"by_country", "by_department", "by_job_title", "distribution"} <= data.keys()

    def test_health(self, client):
        assert client.get("/api/health").json() == {"status": "ok"}
