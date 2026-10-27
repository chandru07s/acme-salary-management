"""Payslip PDF. Uses the built-in PDF fonts, which have no currency symbols for rupees or yen,
so amounts are printed with ISO codes (INR 1,430,000.00) which are unambiguous everywhere."""
from fpdf import FPDF

from app.models import Employee, Payslip, PayrollRun

INK = (16, 27, 52)
MUTED = (93, 106, 128)
ACCENT = (37, 106, 191)
LINE = (227, 232, 240)


def _money(amount: float, currency: str) -> str:
    return f"{currency} {amount:,.2f}"


def _month_label(month: str) -> str:
    import calendar

    return f"{calendar.month_name[int(month[5:])]} {month[:4]}"


def render_payslip(p: Payslip, e: Employee, run: PayrollRun, company: str = "ACME") -> bytes:
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=False)
    pdf.set_title(f"Payslip {run.month} - {e.full_name}")
    pdf.set_author(company)
    pdf.add_page()
    w = pdf.w - 2 * 18
    pdf.set_margins(18, 18, 18)

    # Header band
    pdf.set_fill_color(*INK)
    pdf.rect(0, 0, pdf.w, 34, "F")
    pdf.set_xy(18, 11)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(w / 2, 9, company)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_xy(18 + w / 2, 11)
    pdf.cell(w / 2, 5, "PAYSLIP", align="R")
    pdf.set_xy(18 + w / 2, 17)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(w / 2, 6, _month_label(run.month), align="R")

    # Employee block
    pdf.set_text_color(*INK)
    pdf.set_xy(18, 44)
    pdf.set_font("Helvetica", "B", 15)
    pdf.cell(w, 8, e.full_name, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    pdf.cell(w, 5.5, f"{e.job_title}  |  {e.department}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(w, 5.5, f"Employee ID {e.id}  |  Joined {e.hire_date.isoformat()}  |  Paid in {p.currency}", new_x="LMARGIN", new_y="NEXT")
    if run.status != "approved":
        pdf.set_text_color(180, 90, 0)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(w, 6, f"DRAFT - NOT YET APPROVED ({run.status.replace('_', ' ')})", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    def section(title: str, rows: list[tuple[str, float]], total_label: str, total: float):
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*ACCENT)
        pdf.cell(w, 6, title.upper(), new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(*LINE)
        pdf.line(18, pdf.get_y(), 18 + w, pdf.get_y())
        pdf.set_text_color(*INK)
        for label, amount in rows:
            pdf.set_font("Helvetica", "", 10.5)
            pdf.cell(w * 0.6, 7.5, label)
            pdf.cell(w * 0.4, 7.5, _money(amount, p.currency), align="R", new_x="LMARGIN", new_y="NEXT")
            pdf.line(18, pdf.get_y(), 18 + w, pdf.get_y())
        pdf.set_font("Helvetica", "B", 10.5)
        pdf.cell(w * 0.6, 8, total_label)
        pdf.cell(w * 0.4, 8, _money(total, p.currency), align="R", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    note = f" (prorated, {p.proration:.0%} of month)" if p.proration < 1 else ""
    section("Earnings", [(f"Basic pay{note}", p.basic), ("House rent allowance (HRA)", p.hra), ("Special allowance", p.special),
                         *([("Bonus and incentives", p.variable)] if p.variable else [])], "Gross earnings", p.gross)
    section("Deductions", [(f"Retirement contribution ({p.retirement_pct:g}% of basic)", p.retirement),
                           (f"Income tax withholding ({p.tax_pct:g}% of gross)", p.tax)],
            "Total deductions", p.retirement + p.tax)
    if p.reimbursement:
        section("Reimbursements", [("Expense reimbursements (not taxed)", p.reimbursement)], "Total reimbursements", p.reimbursement)

    # Net pay box
    pdf.set_fill_color(232, 240, 251)
    pdf.set_draw_color(*ACCENT)
    y = pdf.get_y() + 2
    pdf.rect(18, y, w, 18, "DF")
    pdf.set_xy(24, y + 3)
    pdf.set_text_color(*MUTED)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(w / 2, 5, "NET PAY")
    pdf.set_xy(24, y + 8.5)
    pdf.set_text_color(*INK)
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(w / 2, 8, _money(p.net, p.currency))
    pdf.set_xy(18 + w / 2, y + 8.5)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    pdf.cell(w / 2 - 6, 8, f"about USD {p.net_usd:,.2f}", align="R")

    pdf.set_xy(18, 275)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*MUTED)
    approved = f"Approved by {run.approved_by}." if run.approved_by else "Awaiting approval."
    pdf.multi_cell(w, 4, f"{approved} Deduction rates are flat illustrative rates and not statutory EPF/ESI/PT/TDS calculations. "
                         "This is a computer-generated document.")
    return bytes(pdf.output())
