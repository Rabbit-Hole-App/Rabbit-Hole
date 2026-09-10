"""Read one approved S3 CSV and produce a sales report."""
import csv
import io
import json
import os
from decimal import Decimal
from pathlib import Path

import boto3

bucket = os.environ["SMALL_S3_BUCKET"]
key = os.environ["SMALL_INPUT_KEY"]
response = boto3.client("s3").get_object(Bucket=bucket, Key=key)
rows = list(csv.DictReader(io.StringIO(response["Body"].read().decode("utf-8-sig"))))
totals = {}
for row in rows:
    region = row["region"]
    totals[region] = totals.get(region, Decimal(0)) + int(row["quantity"]) * Decimal(row["unit_price"])
report = {"rows": len(rows), "total_sales": str(sum(totals.values(), Decimal(0))),
          "sales_by_region": {region: str(value) for region, value in sorted(totals.items())}}
output = Path(os.environ["SMALL_OUTPUTS"])
output.mkdir(parents=True, exist_ok=True)
(output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"Read {len(rows)} rows from the approved S3 folder. Total sales: {report['total_sales']}")
