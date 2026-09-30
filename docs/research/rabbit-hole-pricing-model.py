"""Reproduce the research scenarios with Python's standard library.

Edit the adjacent assumptions JSON, then run this file. All scenarios use
monthly billing. Churn happens at the start of each month; acquisitions then
receive a full month's revenue/cost. Annual cash collection is not modeled.
"""
import csv
import json
import math
from pathlib import Path

directory = Path(__file__).resolve().parent
inputs = json.loads((directory / "rabbit-hole-pricing-assumptions.json").read_text())
price = inputs["monthly_price"]
fees = price * (inputs["payment_rate"] + inputs["billing_rate"]) + inputs["payment_fixed"]
refunds = price * inputs["refund_reserve_rate"]
paid_service = sum(inputs[key] for key in (
    "paid_ai_cost", "paid_variable_infrastructure", "paid_support_allowance"))
free_burden = inputs["active_free_per_paid"] * inputs["active_free_unit_cost"]
contribution = price - fees - refunds - paid_service - free_burden
fixed = inputs["fixed_nonpayroll_monthly"]
salary = inputs["founder_compensation_monthly"]
rows, scenarios = [], []

for scenario in inputs["scenarios"]:
    paid = inputs["initial_paid"]
    cumulative = -inputs["upfront_investment"]
    peak_funding = -cumulative
    overhead_month = salary_month = recovery_month = None
    acquisition = scenario["new_paid_per_month"] * scenario["cac"]
    snapshots = []
    for month in range(1, inputs["projection_months"] + 1):
        churned = paid * scenario["monthly_churn"]
        paid = paid - churned + scenario["new_paid_per_month"]
        before_salary = paid * contribution - fixed - acquisition
        profit = before_salary - salary
        cumulative += profit
        peak_funding = max(peak_funding, -cumulative)
        if overhead_month is None and before_salary >= 0:
            overhead_month = month
        if salary_month is None and profit >= 0:
            salary_month = month
        if recovery_month is None and cumulative >= 0:
            recovery_month = month
        row = {
            "scenario": scenario["name"], "month": month,
            "paid_users": paid, "new_paid": scenario["new_paid_per_month"],
            "churned_paid": churned, "revenue": paid * price,
            "payment_and_billing": paid * fees, "refund_reserve": paid * refunds,
            "paid_ai": paid * inputs["paid_ai_cost"],
            "paid_other_service": paid * (paid_service - inputs["paid_ai_cost"]),
            "active_free_users": paid * inputs["active_free_per_paid"],
            "free_service": paid * free_burden, "fixed_nonpayroll": fixed,
            "acquisition": acquisition, "founder_compensation": salary,
            "profit_before_founder_pay": before_salary,
            "operating_profit_before_tax": profit,
            "cumulative_after_initial_investment": cumulative,
        }
        rows.append(row)
        if month in (6, 12, 24):
            snapshots.append(row)
    threshold = math.ceil((fixed + salary + acquisition) / contribution) if contribution > 0 else None
    steady_paid = scenario["new_paid_per_month"] / scenario["monthly_churn"] if scenario["monthly_churn"] else None
    scenarios.append({**scenario, "monthly_acquisition_spend": acquisition,
        "full_cost_break_even_paid": threshold, "steady_state_paid": steady_paid,
        "first_month_before_founder_pay_nonnegative": overhead_month,
        "first_month_operating_profit_nonnegative": salary_month,
        "investment_recovered_month": recovery_month,
        "peak_funding_needed_in_horizon": peak_funding, "snapshots": snapshots})

with (directory / "rabbit-hole-pricing-projections.csv").open("w", newline="", encoding="utf-8") as handle:
    writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows({key: round(value, 4) if isinstance(value, float) else value
                     for key, value in row.items()} for row in rows)
result = {"status": inputs["status"], "monthly_payment_fees_per_paid": fees,
          "monthly_paid_service_per_paid": paid_service,
          "monthly_free_service_allocated_per_paid": free_burden,
          "monthly_contribution_per_paid": contribution, "scenarios": scenarios}
(directory / "rabbit-hole-pricing-results.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"contribution": contribution, "scenarios": [
    {key: value for key, value in scenario.items() if key != "snapshots"}
    for scenario in scenarios]}, indent=2))
