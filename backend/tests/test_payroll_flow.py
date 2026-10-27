from datetime import date, timedelta

import pytest
from pypdf import PdfReader
import io

from app.config import DEFAULT_FX_TO_USD, FX_TO_USD

THIS_MONTH = date.today().strftime("%Y-%m")
LAST_MONTH = (date.today().replace(day=1) - timedelta(days=1)).strftime("%Y-%m")


@pytest.fixture(autouse=True)
def restore_fx():
    yield
    FX_TO_USD.update(DEFAULT_FX_TO_USD)


@pytest.fixture()
def staff(add):
    return {
        "a": add(country="US", salary=1_200_000, hire_date="2020-01-01", full_name="Alice Able"),
        "b": add(country="GB", salary=600_000, hire_date="2021-05-05", full_name="Bob Baker"),
    }


def make_run(client, month=LAST_MONTH):
    r = client.post("/api/payroll/runs", json={"month": month})
    assert r.status_code == 201, r.text
    return r.json()


class TestConfig:
    def test_defaults_then_update(self, client):
        assert client.get("/api/settings/pay-config").json()["basic_pct"] == 40
        r = client.put("/api/settings/pay-config", json={"basic_pct": 50, "tax_pct": 15})
        assert r.json()["basic_pct"] == 50 and r.json()["tax_pct"] == 15 and r.json()["retirement_pct"] == 12

    @pytest.mark.parametrize("body", [{"basic_pct": 5}, {"basic_pct": 95}, {"tax_pct": 60}, {"retirement_pct": 31}, {"hra_pct_of_basic": -1}])
    def test_out_of_range_values_are_rejected(self, client, body):
        assert client.put("/api/settings/pay-config", json=body).status_code in (422,)

    def test_structure_endpoint_follows_config(self, client, staff):
        s = client.get(f"/api/employees/{staff['a'].id}/structure").json()
        assert s["monthly"] == {"gross": 100_000.0, "basic": 40_000.0, "hra": 20_000.0, "special": 40_000.0}
        assert s["annual"]["gross"] == 1_200_000
        client.put("/api/settings/pay-config", json={"basic_pct": 50})
        assert client.get(f"/api/employees/{staff['a'].id}/structure").json()["monthly"]["basic"] == 50_000


class TestVariablePay:
    def test_add_list_delete(self, client, staff):
        e = staff["a"].id
        r = client.post(f"/api/employees/{e}/variable-pay", json={"kind": "bonus", "amount": 5000, "month": LAST_MONTH, "note": "Q1"})
        assert r.status_code == 201 and r.json()["created_by"] == "hr@acme.test"
        assert len(client.get(f"/api/employees/{e}/variable-pay").json()) == 1
        assert client.delete(f"/api/variable-pay/{r.json()['id']}").status_code == 204
        assert client.get(f"/api/employees/{e}/variable-pay").json() == []

    @pytest.mark.parametrize("body", [
        {"kind": "lottery", "amount": 10, "month": "2026-01"},
        {"kind": "bonus", "amount": 0, "month": "2026-01"},
        {"kind": "bonus", "amount": 10, "month": "2026-13"},
        {"kind": "bonus", "amount": 10, "month": "jan"},
    ])
    def test_validation(self, client, staff, body):
        assert client.post(f"/api/employees/{staff['a'].id}/variable-pay", json=body).status_code == 422

    def test_unknown_employee_is_404(self, client):
        assert client.post("/api/employees/999/variable-pay", json={"kind": "bonus", "amount": 1, "month": "2026-01"}).status_code == 404

    def test_locked_once_the_month_is_submitted(self, client, staff):
        run = make_run(client)
        client.post(f"/api/payroll/runs/{run['id']}/submit")
        r = client.post(f"/api/employees/{staff['a'].id}/variable-pay", json={"kind": "bonus", "amount": 1, "month": LAST_MONTH})
        assert r.status_code == 409


class TestRuns:
    def test_run_builds_one_payslip_per_active_employee(self, client, staff, add, db):
        gone = add(hire_date="2019-01-01")
        gone.status = "terminated"
        db.commit()
        run = make_run(client)
        assert run["headcount"] == 2 and run["status"] == "draft"
        assert run["gross_usd"] > 0 and run["net_usd"] < run["gross_usd"]

    def test_amounts_and_usd_snapshot(self, client, staff):
        run = make_run(client)
        items = client.get(f"/api/payroll/runs/{run['id']}/payslips").json()["items"]
        alice = next(i for i in items if i["full_name"] == "Alice Able")
        assert (alice["gross"], alice["net"], alice["retirement"], alice["tax"]) == (100_000, 85_200, 4_800, 10_000)
        # fx later changes, but the run keeps the rate it was built with
        client.put("/api/settings/fx/GBP", json={"to_usd": 5})
        assert client.get(f"/api/payroll/runs/{run['id']}").json()["net_usd"] == run["net_usd"]

    def test_variable_pay_flows_into_the_payslip(self, client, staff):
        e = staff["a"].id
        client.post(f"/api/employees/{e}/variable-pay", json={"kind": "bonus", "amount": 20_000, "month": LAST_MONTH})
        client.post(f"/api/employees/{e}/variable-pay", json={"kind": "reimbursement", "amount": 5_000, "month": LAST_MONTH})
        run = make_run(client)
        alice = next(i for i in client.get(f"/api/payroll/runs/{run['id']}/payslips").json()["items"] if i["employee_id"] == e)
        assert alice["gross"] == 120_000 and alice["reimbursement"] == 5_000 and alice["net"] == 120_000 - 4_800 - 12_000 + 5_000

    def test_new_joiner_is_prorated_and_future_joiner_excluded(self, client, add):
        first = date.today().replace(day=1) - timedelta(days=1)  # last day of last month
        mid = first.replace(day=16)
        add(hire_date=mid.isoformat(), salary=1_200_000, country="US", full_name="Mid Joiner")
        add(hire_date=date.today().isoformat(), salary=1_200_000, country="US", full_name="Future Joiner")
        run = make_run(client)
        names = {i["full_name"]: i for i in client.get(f"/api/payroll/runs/{run['id']}/payslips").json()["items"]}
        assert "Future Joiner" not in names
        days = first.day
        expected = round(((first - mid).days + 1) / days, 6)
        assert names["Mid Joiner"]["proration"] == expected and names["Mid Joiner"]["gross"] < 100_000

    def test_duplicate_month_future_month_and_bad_month(self, client, staff):
        make_run(client)
        assert client.post("/api/payroll/runs", json={"month": LAST_MONTH}).status_code == 409
        future = (date.today().replace(day=1) + timedelta(days=40)).strftime("%Y-%m")
        assert client.post("/api/payroll/runs", json={"month": future}).status_code == 422
        assert client.post("/api/payroll/runs", json={"month": "2026-13"}).status_code == 422

    def test_search_and_pagination(self, client, staff):
        run = make_run(client)
        r = client.get(f"/api/payroll/runs/{run['id']}/payslips?q=alice").json()
        assert r["total"] == 1 and r["items"][0]["full_name"] == "Alice Able"
        assert client.get(f"/api/payroll/runs/{run['id']}/payslips?page_size=1&page=2").json()["items"][0]["full_name"] == "Bob Baker"

    def test_regenerate_picks_up_changes_but_only_in_draft(self, client, staff):
        run = make_run(client)
        client.patch(f"/api/employees/{staff['a'].id}", json={"salary": 2_400_000})
        assert client.post(f"/api/payroll/runs/{run['id']}/regenerate").status_code == 200
        items = client.get(f"/api/payroll/runs/{run['id']}/payslips?q=alice").json()["items"]
        assert items[0]["gross"] == 200_000
        client.post(f"/api/payroll/runs/{run['id']}/submit")
        assert client.post(f"/api/payroll/runs/{run['id']}/regenerate").status_code == 409

    def test_delete_only_in_draft(self, client, staff):
        a = make_run(client)
        assert client.delete(f"/api/payroll/runs/{a['id']}").status_code == 204
        assert client.get(f"/api/payroll/runs/{a['id']}").status_code == 404
        b = make_run(client)
        client.post(f"/api/payroll/runs/{b['id']}/submit")
        assert client.delete(f"/api/payroll/runs/{b['id']}").status_code == 409

    def test_empty_run_cannot_be_submitted(self, client):
        run = make_run(client)
        assert run["headcount"] == 0
        assert client.post(f"/api/payroll/runs/{run['id']}/submit").status_code == 422


class TestMakerChecker:
    def test_full_happy_path_with_audit_trail(self, client, act_as, staff):
        run = make_run(client)
        assert client.post(f"/api/payroll/runs/{run['id']}/submit").json()["status"] == "pending_approval"
        act_as("owner")
        done = client.post(f"/api/payroll/runs/{run['id']}/approve").json()
        assert done["status"] == "approved" and done["approved_by"] == "owner@acme.test"
        detail = client.get(f"/api/payroll/runs/{run['id']}").json()
        assert [e["action"] for e in detail["events"]] == ["approved", "submitted", "created"]

    def test_hr_cannot_approve_and_owner_cannot_prepare(self, client, act_as, staff):
        run = make_run(client)
        client.post(f"/api/payroll/runs/{run['id']}/submit")
        assert client.post(f"/api/payroll/runs/{run['id']}/approve").status_code == 403  # hr
        act_as("owner")
        assert client.post("/api/payroll/runs", json={"month": "2026-01"}).status_code == 403
        assert client.post(f"/api/payroll/runs/{run['id']}/regenerate").status_code == 403

    def test_the_maker_can_never_approve_their_own_run_even_with_the_owner_role(self, client, act_as, staff, db):
        # Build and submit a run as the same person, then try to approve it as that person with the owner role.
        from app.services import payroll as svc

        run = svc.create_run(db, LAST_MONTH, "same@acme.test")
        svc.submit(db, run.id, "same@acme.test")
        act_as("owner", email="same@acme.test")
        r = client.post(f"/api/payroll/runs/{run.id}/approve")
        assert r.status_code == 403 and "can't approve" in r.json()["detail"]

    def test_reject_sends_back_with_a_reason_and_allows_edits(self, client, act_as, staff):
        run = make_run(client)
        client.post(f"/api/payroll/runs/{run['id']}/submit")
        act_as("owner")
        assert client.post(f"/api/payroll/runs/{run['id']}/reject", json={"note": ""}).status_code == 422
        back = client.post(f"/api/payroll/runs/{run['id']}/reject", json={"note": "Bonus for Bob missing"}).json()
        assert back["status"] == "draft" and back["reject_note"] == "Bonus for Bob missing"
        act_as("hr")
        assert client.post(f"/api/payroll/runs/{run['id']}/regenerate").json()["reject_note"] is None

    def test_approved_runs_are_frozen(self, client, act_as, staff):
        run = make_run(client)
        client.post(f"/api/payroll/runs/{run['id']}/submit")
        act_as("owner")
        client.post(f"/api/payroll/runs/{run['id']}/approve")
        assert client.post(f"/api/payroll/runs/{run['id']}/approve").status_code == 409
        act_as("hr")
        assert client.post(f"/api/payroll/runs/{run['id']}/regenerate").status_code == 409
        assert client.delete(f"/api/payroll/runs/{run['id']}").status_code == 409
        assert client.post(f"/api/payroll/runs/{run['id']}/submit").status_code == 409


class TestRoleAccess:
    def test_viewer_is_read_only_and_cannot_see_payroll(self, client, act_as, staff):
        run = make_run(client)
        act_as("viewer")
        assert client.get("/api/employees").status_code == 200
        assert client.get("/api/payroll/runs").status_code == 403
        assert client.get(f"/api/payroll/runs/{run['id']}/payslips").status_code == 403
        assert client.get(f"/api/employees/{staff['a'].id}/payslips").status_code == 403
        assert client.post("/api/employees", json={}).status_code == 403
        assert client.patch(f"/api/employees/{staff['a'].id}", json={"salary": 1}).status_code == 403
        assert client.put("/api/settings/fx/GBP", json={"to_usd": 1}).status_code == 403
        assert client.put("/api/settings/pay-config", json={"tax_pct": 1}).status_code == 403

    def test_owner_can_read_payroll_but_not_edit_employees(self, client, act_as, staff):
        run = make_run(client)
        act_as("owner")
        assert client.get(f"/api/payroll/runs/{run['id']}").status_code == 200
        assert client.patch(f"/api/employees/{staff['a'].id}", json={"salary": 1}).status_code == 403


class TestPayslipPdf:
    def test_pdf_contains_the_numbers(self, client, staff):
        run = make_run(client)
        slip = client.get(f"/api/payroll/runs/{run['id']}/payslips?q=alice").json()["items"][0]
        r = client.get(f"/api/payslips/{slip['id']}/pdf")
        assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
        assert "payslip-" in r.headers["content-disposition"] and "Alice-Able" in r.headers["content-disposition"]
        text = "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(r.content)).pages)
        for needle in ("Alice Able", "USD 100,000.00", "USD 85,200.00", "NET PAY", "DRAFT"):
            assert needle in text

    def test_approved_pdf_has_no_draft_banner_and_missing_is_404(self, client, act_as, staff):
        run = make_run(client)
        client.post(f"/api/payroll/runs/{run['id']}/submit")
        act_as("owner")
        client.post(f"/api/payroll/runs/{run['id']}/approve")
        slip = client.get(f"/api/payroll/runs/{run['id']}/payslips").json()["items"][0]
        text = PdfReader(io.BytesIO(client.get(f"/api/payslips/{slip['id']}/pdf").content)).pages[0].extract_text()
        assert "DRAFT" not in text and "Approved by owner@acme.test" in text
        assert client.get("/api/payslips/99999/pdf").status_code == 404

    def test_employee_payslip_history(self, client, staff):
        make_run(client)
        hist = client.get(f"/api/employees/{staff['a'].id}/payslips").json()
        assert len(hist) == 1 and hist[0]["month"] == LAST_MONTH and hist[0]["status"] == "draft"
