from datetime import date

import pytest

from app.schemas import EmployeeCreate, EmployeeUpdate
from app.services import employees as svc
from app.services.employees import DuplicateEmailError, EmployeeFilters, NotFoundError
from tests.conftest import make_payload


def _create(db, **overrides):
    data = make_payload(**overrides)
    data["hire_date"] = date.fromisoformat(data["hire_date"])
    return svc.create_employee(db, EmployeeCreate(**data))


class TestCreate:
    def test_currency_is_derived_from_country(self, db):
        assert _create(db, country="IN").currency == "INR"

    def test_writes_initial_salary_history(self, db):
        emp = _create(db, salary=90_000)
        history = svc.salary_history(db, emp.id)
        assert len(history) == 1
        assert (history[0].old_salary, history[0].new_salary) == (None, 90_000)

    def test_duplicate_email_rejected_case_insensitively(self, db):
        _create(db, email="dup@acme.com")
        with pytest.raises(DuplicateEmailError):
            _create(db, email="DUP@acme.com")


class TestUpdate:
    def test_salary_change_appends_history_with_reason(self, db):
        emp = _create(db, salary=100_000)
        svc.update_employee(db, emp.id, EmployeeUpdate(salary=110_000, reason="Promotion"))

        history = svc.salary_history(db, emp.id)
        assert len(history) == 2
        latest = history[0]  # newest first
        assert (latest.old_salary, latest.new_salary, latest.reason) == (100_000, 110_000, "Promotion")
        assert svc.get_employee(db, emp.id).salary == 110_000

    def test_unchanged_salary_adds_no_history(self, db):
        emp = _create(db, salary=100_000)
        svc.update_employee(db, emp.id, EmployeeUpdate(salary=100_000, department="Product"))
        assert len(svc.salary_history(db, emp.id)) == 1
        assert svc.get_employee(db, emp.id).department == "Product"

    def test_partial_update_leaves_other_fields_alone(self, db):
        emp = _create(db, full_name="Grace Hopper", job_title="Staff Engineer")
        svc.update_employee(db, emp.id, EmployeeUpdate(job_title="Engineering Manager"))
        refreshed = svc.get_employee(db, emp.id)
        assert (refreshed.full_name, refreshed.job_title) == ("Grace Hopper", "Engineering Manager")

    def test_changing_country_rederives_currency(self, db):
        emp = _create(db, country="US")
        svc.update_employee(db, emp.id, EmployeeUpdate(country="JP"))
        assert svc.get_employee(db, emp.id).currency == "JPY"

    def test_cannot_take_another_employees_email(self, db):
        _create(db, email="a@acme.com")
        b = _create(db, email="b@acme.com")
        with pytest.raises(DuplicateEmailError):
            svc.update_employee(db, b.id, EmployeeUpdate(email="a@acme.com"))

    def test_keeping_own_email_is_fine(self, db):
        emp = _create(db, email="me@acme.com")
        svc.update_employee(db, emp.id, EmployeeUpdate(email="me@acme.com", full_name="New Name"))

    def test_unknown_id_raises(self, db):
        with pytest.raises(NotFoundError):
            svc.update_employee(db, 999, EmployeeUpdate(salary=1))


class TestDeactivate:
    def test_is_soft_delete(self, db):
        emp = _create(db)
        svc.deactivate_employee(db, emp.id)
        assert svc.get_employee(db, emp.id).status == "terminated"


class TestListing:
    @pytest.fixture()
    def people(self, add):
        return [
            add(full_name="Alice Active", country="US", department="Engineering", job_title="Software Engineer", salary=100_000),
            add(full_name="Bob Builder", country="IN", department="Operations", job_title="Operations Manager", salary=5_000_000),
            add(full_name="Carol Cash", country="GB", department="Engineering", job_title="Staff Engineer", salary=150_000),
        ]

    def test_filter_by_country(self, db, people):
        items, total = svc.list_employees(db, EmployeeFilters(country="IN"))
        assert [e.full_name for e in items] == ["Bob Builder"] and total == 1

    def test_filter_by_department_and_title_combine(self, db, people):
        items, _ = svc.list_employees(db, EmployeeFilters(department="Engineering", job_title="Staff Engineer"))
        assert [e.full_name for e in items] == ["Carol Cash"]

    def test_search_is_case_insensitive_on_name_and_email(self, db, people):
        assert svc.list_employees(db, EmployeeFilters(q="bOb"))[1] == 1
        assert svc.list_employees(db, EmployeeFilters(q="user3@"))[1] == 1

    def test_pagination_reports_total_and_slices(self, db, people):
        items, total = svc.list_employees(db, EmployeeFilters(), page=2, page_size=2)
        assert total == 3 and len(items) == 1

    def test_page_size_is_capped(self, db, people):
        items, _ = svc.list_employees(db, EmployeeFilters(), page_size=10_000)
        assert len(items) == 3  # no error; capped to MAX_PAGE_SIZE

    def test_sort_by_usd_value_not_raw_local_amount(self, db, people):
        # Raw: Bob 5,000,000 INR is the biggest number, but is only ~60k USD.
        items, _ = svc.list_employees(db, EmployeeFilters(), sort_by="salary_usd", order="desc")
        assert [e.full_name for e in items] == ["Carol Cash", "Alice Active", "Bob Builder"]

    def test_unknown_sort_field_falls_back_to_id(self, db, people):
        items, _ = svc.list_employees(db, EmployeeFilters(), sort_by="nonsense")
        assert [e.id for e in items] == sorted(e.id for e in items)
